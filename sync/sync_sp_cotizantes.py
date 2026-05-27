"""
Sync "Numero de cotizantes Totales" de SP -> SQL Server (Inteligencia_Mercado.dbo.AFP_CL_SP_Cotizantes).

Fuente:
  Superintendencia de Pensiones, Centro de Estadisticas, fila 3 "Numero de
  cotizantes Totales" del cuadro Cotizaciones y Cotizantes / AFP.

  Indice (con dropdown de periodos):
    https://www.spensiones.cl/apps/centroEstadisticas/paginaCuadrosCCEE.php
      ?menu=sci&menuN1=cotycot&menuN2=afp

  Reporte por periodo (renderizado HTML con la tabla de 7 AFPs + TOTAL):
    https://www.spensiones.cl/apps/loadEstadisticas/siSP.php
      ?id=inf_estadistica/aficot/mensual/{YYYY}/{MM}/03F.html
      &menu=sci&menuN1=cotycot&menuN2=afp&orden=30&ext=.html

ESTRATEGIA DE LOAD
==================
Re-carga idempotente por fecha (ultimo dia del periodo): DELETE FROM
AFP_CL_SP_Cotizantes WHERE fecha = X, seguido de INSERT por las 7 AFPs.
Historia completa se preserva en SQL Server; la ventana rolling vive en
Supabase via sync_sqlserver_to_supabase.py.

MODOS DE EJECUCION
==================

1) INCREMENTAL (default): re-carga los ultimos 4 periodos publicados por SP.

       python sync_sp_cotizantes.py

2) PERIODO unico:

       python sync_sp_cotizantes.py --periodo 2025-11
       python sync_sp_cotizantes.py --periodo 202511        # ambos formatos OK

3) RANGO (backfill historico):

       python sync_sp_cotizantes.py --start 2024-01 --end 2025-11
       python sync_sp_cotizantes.py --start 202401          # sin --end = hasta mes anterior

VARIABLES REQUERIDAS EN .env
============================
  DB_SERVER, DB_DATABASE, DB_UID, DB_PWD
"""

import os
import re
import sys
import argparse
import calendar
import urllib.parse
from datetime import datetime, date
from time import time

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()


# =============================================================
# CONSTANTES
# =============================================================

SP_BASE = "https://www.spensiones.cl"
SP_INDEX_URL = (
    f"{SP_BASE}/apps/centroEstadisticas/paginaCuadrosCCEE.php"
    "?menu=sci&menuN1=cotycot&menuN2=afp"
)
# El dropdown de la fila 3 ("Numero de cotizantes Totales") tiene name=aaaamm2
# y options con value="inf_estadistica/aficot/mensual/YYYY/MM/03F".
SP_REPORT_URL_TPL = (
    f"{SP_BASE}/apps/loadEstadisticas/siSP.php"
    "?id=inf_estadistica/aficot/mensual/{yyyy}/{mm}/03F.html"
    "&menu=sci&menuN1=cotycot&menuN2=afp&orden=30&ext=.html"
)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
LATEST_N_MONTHS = 4

# Las 7 AFPs vigentes; cualquier glosa que NO sea una de estas (e.g. "TOTAL")
# se descarta al parsear.
AFPS_VALIDAS = {"CAPITAL", "CUPRUM", "HABITAT", "MODELO", "PLANVITAL", "PROVIDA", "UNO"}

# Regex para extraer del HTML del indice los <option value="inf_estadistica/aficot/mensual/YYYY/MM/03F">.
INDEX_PERIODO_RE = re.compile(
    r'value="inf_estadistica/aficot/mensual/(\d{4})/(\d{2})/03F"'
)

# Regex para extraer filas de la tabla del reporte. La tabla tiene 8 filas
# (7 AFPs + TOTAL) con celdas como:
#   <td  > CAPITAL </td>  <td  > 805.133 </td>
# Algunos espacios y saltos de linea entre tags; usamos DOTALL.
ROW_RE = re.compile(
    r"<td\b[^>]*>\s*([A-Z]+)\s*</td>\s*<td\b[^>]*>\s*([\d.]+)\s*</td>",
    re.IGNORECASE | re.DOTALL,
)


# =============================================================
# CONEXIONES
# =============================================================

def connect_sqlserver():
    """Engine SQLAlchemy contra Inteligencia_Mercado usando ODBC Driver 18.
    Encrypt=optional + Trust SC porque el server corp no tiene cert TLS valido."""
    server = os.getenv("DB_SERVER")
    database = os.getenv("DB_DATABASE")
    user = os.getenv("DB_UID")
    pwd = os.getenv("DB_PWD")
    if not all([server, database, user, pwd]):
        raise RuntimeError("Faltan DB_SERVER/DB_DATABASE/DB_UID/DB_PWD en .env")

    odbc = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={user};"
        f"PWD={pwd};"
        f"Encrypt=optional;"
        f"TrustServerCertificate=yes;"
    )
    params = urllib.parse.quote_plus(odbc)
    print(f"      server={server} database={database} driver=ODBC18")
    return create_engine(f"mssql+pyodbc:///?odbc_connect={params}")


def _new_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


# =============================================================
# SCRAPING SP
# =============================================================

def get_published_periodos_from_sp(session: requests.Session = None) -> list:
    """Devuelve los periodos 'YYYY-MM' que aparecen en el dropdown de la
    fila 3 (mas reciente primero). Es la fuente de verdad de "que esta
    publicado", igual que en sync_sp_xml.py."""
    if session is None:
        session = _new_session()
    r = session.get(SP_INDEX_URL, timeout=30)
    r.raise_for_status()
    pairs = INDEX_PERIODO_RE.findall(r.text)
    if not pairs:
        raise RuntimeError(
            "No se encontraron periodos en el dropdown de cotizantes en SP"
        )
    # Conserva orden de aparicion (SP los lista desc) y deduplica.
    seen, out = set(), []
    for y, m in pairs:
        p = f"{y}-{m}"
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def fetch_report_html(periodo: str, session: requests.Session = None) -> str:
    """Descarga el HTML del reporte fila 3 para `periodo` ('YYYY-MM')."""
    if session is None:
        session = _new_session()

    # Indice -> cookie (defensivo, igual que en sync_sp_xml.py).
    session.get(SP_INDEX_URL, timeout=30)

    yyyy, mm = periodo.split("-")
    url = SP_REPORT_URL_TPL.format(yyyy=yyyy, mm=mm)
    r = session.get(url, headers={"Referer": SP_INDEX_URL}, timeout=30)
    r.raise_for_status()
    return r.text


def parse_report(html: str) -> list:
    """HTML -> lista de dicts {afp, n_cotizantes}. Solo las 7 AFPs (descarta
    fila TOTAL)."""
    rows = []
    for afp_glosa, num_str in ROW_RE.findall(html):
        afp = afp_glosa.strip().upper()
        if afp not in AFPS_VALIDAS:
            continue  # descarta TOTAL u otros encabezados
        # SP usa "." como separador de miles (formato chileno): "805.133"
        n = int(num_str.replace(".", ""))
        rows.append({"afp": afp, "n_cotizantes": n})
    return rows


def end_of_month(periodo: str) -> date:
    """'YYYY-MM' -> date(YYYY, MM, last_day)."""
    y, m = int(periodo[:4]), int(periodo[5:7])
    last = calendar.monthrange(y, m)[1]
    return date(y, m, last)


# =============================================================
# LOAD A SQL SERVER
# =============================================================

def load_periodo(engine, periodo: str, parsed_rows: list) -> int:
    """DELETE WHERE fecha=X, INSERT 7 filas. Devuelve cantidad insertada."""
    # ISO string para evitar el bind directo de datetime.date que el driver
    # legacy 'SQL Server' no soporta (HYC00).
    fecha = end_of_month(periodo).isoformat()

    if len(parsed_rows) != 7:
        raise RuntimeError(
            f"Periodo {periodo}: se esperaban 7 AFPs, se encontraron "
            f"{len(parsed_rows)}: {[r['afp'] for r in parsed_rows]}"
        )

    print(f"      borrando data previa de fecha={fecha}...", flush=True)
    with engine.begin() as conn:
        cur = conn.connection.cursor()
        try:
            cur.execute(
                "DELETE FROM dbo.AFP_CL_SP_Cotizantes WHERE fecha = ?",
                fecha,
            )
            sql = (
                "INSERT INTO dbo.AFP_CL_SP_Cotizantes (fecha, afp, n_cotizantes) "
                "VALUES (?, ?, ?)"
            )
            payload = [(fecha, r["afp"], r["n_cotizantes"]) for r in parsed_rows]
            try:
                cur.fast_executemany = True
            except AttributeError:
                pass
            cur.executemany(sql, payload)
        finally:
            cur.close()

    total = sum(r["n_cotizantes"] for r in parsed_rows)
    print(f"      -> 7 AFPs insertadas (total cotizantes={total:,})")
    return len(parsed_rows)


# =============================================================
# RESOLUCION DE PERIODOS
# =============================================================

def normalize_periodo(s: str) -> str:
    """'202511' | '2025-11' | '2025/11' -> '2025-11'."""
    s = s.strip().replace("/", "-")
    if re.match(r"^\d{4}-\d{2}$", s):
        return s
    if re.match(r"^\d{6}$", s):
        return f"{s[:4]}-{s[4:]}"
    raise ValueError(f"Periodo invalido: {s!r} (esperado YYYY-MM o YYYYMM)")


def _periodos_between(start: str, end: str) -> list:
    sy, sm = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7])
    out = []
    while (sy, sm) <= (ey, em):
        out.append(f"{sy:04d}-{sm:02d}")
        sm += 1
        if sm > 12:
            sy, sm = sy + 1, 1
    return out


def resolve_periodos(args, session: requests.Session = None) -> list:
    """Modo explicito (--periodo / --start) usa lo pedido. Incremental
    consulta el dropdown y devuelve los ultimos LATEST_N_MONTHS publicados
    (oldest first)."""
    if args.periodo:
        return [normalize_periodo(args.periodo)]
    if args.start:
        start = normalize_periodo(args.start)
        if args.end:
            end = normalize_periodo(args.end)
        else:
            published = get_published_periodos_from_sp(session)
            end = published[0]
        return _periodos_between(start, end)
    published = get_published_periodos_from_sp(session)
    if not published:
        raise RuntimeError("SP no devolvio ningun periodo en el dropdown")
    target = published[:LATEST_N_MONTHS]
    return list(reversed(target))


# =============================================================
# RESUMEN
# =============================================================

def print_summary(engine):
    print("\n--- Resumen tabla AFP_CL_SP_Cotizantes ---")
    with engine.connect() as conn:
        n = conn.execute(text("SELECT COUNT(*) FROM dbo.AFP_CL_SP_Cotizantes")).scalar() or 0
        print(f"  filas totales: {n:,}")
        r = conn.execute(
            text("SELECT MIN(fecha), MAX(fecha) FROM dbo.AFP_CL_SP_Cotizantes")
        ).first()
        if r and r[0]:
            print(f"  rango fechas:  [{r[0]} -> {r[1]}]")


# =============================================================
# MAIN
# =============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Sync 'Numero de cotizantes Totales' de SP -> SQL Server (dbo.AFP_CL_SP_Cotizantes)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--periodo", help="Periodo unico (YYYY-MM o YYYYMM)")
    parser.add_argument("--start", help="Periodo inicio backfill")
    parser.add_argument("--end", help="Periodo fin backfill (default: ultimo publicado)")
    args = parser.parse_args()

    start_time = datetime.now()
    print(f"Inicio: {start_time:%Y-%m-%d %H:%M:%S}")

    print("Conectando a SQL Server (Inteligencia_Mercado)...")
    engine = connect_sqlserver()
    print("Conexion OK\n")

    session = _new_session()

    incremental = not (args.periodo or args.start)
    periodos = resolve_periodos(args, session=session)
    print(f"MODO: {'INCREMENTAL (ultimos publicados)' if incremental else 'EXPLICITO'}")
    print(f"Periodos a procesar ({len(periodos)}): {', '.join(periodos)}")
    print()

    skipped = []

    try:
        for periodo in periodos:
            print(f"[periodo {periodo}]")
            t0 = time()
            try:
                html = fetch_report_html(periodo, session=session)
                parsed = parse_report(html)
            except (requests.HTTPError, RuntimeError) as e:
                if incremental:
                    print(f"      SKIP: {periodo} -> {e}\n")
                    skipped.append(periodo)
                    continue
                raise

            if not parsed and incremental:
                print(f"      SKIP: {periodo} no devolvio filas (no publicado todavia?)\n")
                skipped.append(periodo)
                continue

            load_periodo(engine, periodo, parsed)
            print(f"      done en {time()-t0:.1f}s\n")

        if skipped:
            print(f"Periodos skipped: {', '.join(skipped)}\n")
        print_summary(engine)
    except Exception as e:
        print(f"\n[ERROR] {e}", file=sys.stderr)
        raise

    elapsed = datetime.now() - start_time
    print(f"\nSync completado en {elapsed.total_seconds():.1f}s")


if __name__ == "__main__":
    main()
