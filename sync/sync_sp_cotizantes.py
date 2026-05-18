"""
Sync "Numero de cotizantes Totales" de SP -> Supabase (tabla cotizantes_afp).

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
cotizantes_afp WHERE fecha = X, seguido de INSERT por las 7 AFPs.

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
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import os
import re
import sys
import argparse
import calendar
from datetime import datetime, date
from time import time

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

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

def connect_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not all([url, key]):
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env")
    print(f"      url={url}")
    return create_client(url, key)


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
# LOAD A SUPABASE
# =============================================================

def load_periodo(client: Client, periodo: str, parsed_rows: list) -> int:
    """DELETE WHERE fecha=X, INSERT 7 filas. Devuelve cantidad insertada."""
    fecha = end_of_month(periodo).isoformat()

    if len(parsed_rows) != 7:
        raise RuntimeError(
            f"Periodo {periodo}: se esperaban 7 AFPs, se encontraron "
            f"{len(parsed_rows)}: {[r['afp'] for r in parsed_rows]}"
        )

    print(f"      borrando data previa de fecha={fecha}...", flush=True)
    client.table("cotizantes_afp").delete().eq("fecha", fecha).execute()

    payload = [{"fecha": fecha, **r} for r in parsed_rows]
    client.table("cotizantes_afp").insert(payload).execute()

    total = sum(r["n_cotizantes"] for r in parsed_rows)
    print(f"      -> 7 AFPs insertadas (total cotizantes={total:,})")
    return len(payload)


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

def print_summary(client: Client):
    print("\n--- Resumen tabla cotizantes_afp ---")
    resp = client.table("cotizantes_afp").select("*", count="exact").limit(1).execute()
    print(f"  filas totales: {resp.count or 0:,}")
    asc = client.table("cotizantes_afp").select("fecha").order("fecha", desc=False).limit(1).execute()
    dsc = client.table("cotizantes_afp").select("fecha").order("fecha", desc=True).limit(1).execute()
    if asc.data and dsc.data:
        print(f"  rango fechas:  [{asc.data[0]['fecha']} -> {dsc.data[0]['fecha']}]")


# =============================================================
# MAIN
# =============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Sync 'Numero de cotizantes Totales' de SP -> Supabase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--periodo", help="Periodo unico (YYYY-MM o YYYYMM)")
    parser.add_argument("--start", help="Periodo inicio backfill")
    parser.add_argument("--end", help="Periodo fin backfill (default: ultimo publicado)")
    args = parser.parse_args()

    start_time = datetime.now()
    print(f"Inicio: {start_time:%Y-%m-%d %H:%M:%S}")

    print("Conectando a Supabase REST API...")
    client = connect_supabase()
    print("Conexion OK\n")

    session = _new_session()

    incremental = not (args.periodo or args.start)
    periodos = resolve_periodos(args, session=session)
    print(f"MODO: {'INCREMENTAL (ultimos publicados)' if incremental else 'EXPLICITO'}")
    print(f"Periodos a procesar ({len(periodos)}): {', '.join(periodos)}")

    # Modo incremental: borrar fechas mas viejas que el oldest target
    # para mantener la ventana rolling de 4 meses.
    if incremental:
        oldest_target = end_of_month(min(periodos)).isoformat()
        resp = (
            client.table("cotizantes_afp")
            .delete()
            .lt("fecha", oldest_target)
            .execute()
        )
        n_drop = len(resp.data) if resp.data else 0
        if n_drop:
            print(f"Borrados {n_drop:,} filas con fecha < {oldest_target} (rolling window)")
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

            load_periodo(client, periodo, parsed)
            print(f"      done en {time()-t0:.1f}s\n")

        if skipped:
            print(f"Periodos skipped: {', '.join(skipped)}\n")
        print_summary(client)
    except Exception as e:
        print(f"\n[ERROR] {e}", file=sys.stderr)
        raise

    elapsed = datetime.now() - start_time
    print(f"\nSync completado en {elapsed.total_seconds():.1f}s")


if __name__ == "__main__":
    main()
