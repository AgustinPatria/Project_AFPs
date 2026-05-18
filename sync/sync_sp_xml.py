"""
Sync XML publico de la SP (cartera_agregada<YYYYMM>.xml) -> Supabase.

Cubre la "ventana" de los ultimos 4 meses: la SP publica el agregado mensual
sin desfase regulatorio, mientras que CHIST llega 4 meses tarde. Mientras un
mes esta solo en SP, el dashboard lo lee desde estas tablas; cuando CHIST
llega, asciende a las vistas detalladas y la data SP del mismo mes queda como
referencia para validacion cruzada.

FLUJO HTTP CONTRA spensiones.cl
================================
1. GET pagina indice -> guarda cookie de sesion.
2. GET pagina detalle del periodo (con Referer al indice) -> HTML con el href.
3. Regex extrae el href del <A>Obtener Aqui</A> (no es predecible: incluye un
   `param` codificado).
4. GET ZIP -> bytes.
5. Extrae el .xml interno del ZIP.
6. Parsea el XML y carga a Supabase.

ESTRATEGIA DE LOAD
==================
Re-carga idempotente por periodo: DELETE FROM sp_fila WHERE periodo = X
(las FK con ON DELETE CASCADE limpian las 3 tablas de valores), seguido de
INSERT por batches via REST API.

MODOS DE EJECUCION
==================

1) INCREMENTAL (default): re-carga los ultimos 4 meses publicados y BORRA
   periodos anteriores. Usar --no-prune para conservar backfill historico:

       python sync_sp_xml.py
       python sync_sp_xml.py --no-prune     # preserva 2025-01..2025-11 backfill

2) PERIODO unico:

       python sync_sp_xml.py --periodo 2025-11
       python sync_sp_xml.py --periodo 202511        # ambos formatos OK

3) RANGO (backfill historico):

       python sync_sp_xml.py --start 2024-01 --end 2025-11
       python sync_sp_xml.py --start 202401          # sin --end = hasta mes anterior

4) ARCHIVO LOCAL (dev/testing sin descargar):

       python sync_sp_xml.py --periodo 2025-11 --xml-file cartera_agregada202511.xml

VARIABLES REQUERIDAS EN .env
============================
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import os
import re
import sys
import io
import argparse
import zipfile
from datetime import datetime, date
from time import time
from pathlib import Path
from xml.etree import ElementTree as ET

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
    "?menu=sci&menuN1=estfinfp&menuN2=NOID"
)
SP_DETAIL_URL_TPL = (
    f"{SP_BASE}/apps/loadCarteras/loadCarAgr.php"
    "?menu=sci&menuN1=estfinfp&menuN2=NOID&orden=20&periodo={periodo}&ext=.php"
)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
SP_NS = {"sp": "http://www.spensiones.cl/xml"}
LATEST_N_MONTHS = 4

# Regex para extraer el href del ZIP. Ejemplo del HTML real:
#   <A HREF='/apps/GetFile_v2.0.php?param=a0lh...'>Obtener Aqu&iacute;</A>
ZIP_HREF_RE = re.compile(
    r"<A\s+HREF='(/apps/GetFile_v2\.0\.php\?param=[^']+)'\s*>\s*Obtener\s+Aqu",
    re.IGNORECASE,
)

# Regex para extraer los periodos publicados del dropdown de
# "2. Cartera de inversiones agregada" en la pagina indice. Cada option es:
#   <option value="202603#/apps/loadCarteras/loadCarAgr.php">2026/03</option>
INDEX_DROPDOWN_RE = re.compile(
    r"Cartera de inversiones agregada.*?<select[^>]*>(.*?)</select>",
    re.DOTALL | re.IGNORECASE,
)
INDEX_OPTION_RE = re.compile(r'value=["\'](\d{4})(\d{2})#')


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


# =============================================================
# HTTP / SCRAPING SP
# =============================================================

def _new_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def get_published_periodos_from_sp(session: requests.Session = None) -> list:
    """Devuelve la lista de periodos 'YYYY-MM' publicados por SP para
    'Cartera de inversiones agregada', ordenados desc (mas reciente primero).
    Es la unica fuente confiable porque SP a veces tiene la pagina detalle
    armada para meses que el ZIP todavia no esta listo."""
    if session is None:
        session = _new_session()
    r = session.get(SP_INDEX_URL, timeout=30)
    r.raise_for_status()
    m = INDEX_DROPDOWN_RE.search(r.text)
    if not m:
        raise RuntimeError(
            "No se encontro el dropdown de 'Cartera de inversiones agregada' "
            "en la pagina indice de SP"
        )
    periodos = INDEX_OPTION_RE.findall(m.group(1))
    return sorted({f"{y}-{mo}" for y, mo in periodos}, reverse=True)


def fetch_xml_for_periodo(periodo_url: str, session: requests.Session = None) -> bytes:
    """Descarga el XML para `periodo_url` (formato 'YYYYMM') y devuelve los bytes
    del archivo .xml (no del ZIP). Hace los 5 pasos del flujo HTTP."""

    if session is None:
        session = _new_session()

    # 1. Indice -> cookie
    r = session.get(SP_INDEX_URL, timeout=30)
    r.raise_for_status()

    # 2. Detalle (con Referer)
    detail_url = SP_DETAIL_URL_TPL.format(periodo=periodo_url)
    r = session.get(detail_url, headers={"Referer": SP_INDEX_URL}, timeout=30)
    r.raise_for_status()

    # 3. Extraer href
    m = ZIP_HREF_RE.search(r.text)
    if not m:
        raise RuntimeError(
            f"No se encontro el link 'Obtener Aqui' para periodo={periodo_url}. "
            f"Probablemente el periodo no esta publicado todavia."
        )
    zip_url = SP_BASE + m.group(1)

    # 4. Descarga ZIP
    r = session.get(zip_url, headers={"Referer": detail_url}, timeout=120)
    r.raise_for_status()
    if "application/zip" not in r.headers.get("Content-Type", ""):
        raise RuntimeError(
            f"Respuesta inesperada en descarga ZIP: Content-Type="
            f"{r.headers.get('Content-Type')!r}"
        )

    # 5. Extraer .xml
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        xml_names = [n for n in z.namelist() if n.lower().endswith(".xml")]
        if not xml_names:
            raise RuntimeError(f"ZIP no contiene .xml: {z.namelist()}")
        return z.read(xml_names[0])


# =============================================================
# PARSEO XML
# =============================================================

def _localname(elem) -> str:
    """'{namespace}tag' -> 'tag'."""
    t = elem.tag
    return t.rsplit("}", 1)[-1] if "}" in t else t


def _text(elem) -> str:
    """Texto del elemento o None si esta ausente / xsi:nil."""
    if elem is None:
        return None
    nil = elem.attrib.get("{http://www.w3.org/2001/XMLSchema-instance}nil")
    if nil == "true":
        return None
    txt = (elem.text or "").strip()
    return txt or None


def _num(elem):
    """Texto numerico -> float (o None)."""
    s = _text(elem)
    if s is None:
        return None
    try:
        return float(s)
    except ValueError:
        return None


# Wrappers que aportan contexto pero no son datos
_WRAPPERS_CTX = {
    "tipofondo": ("sub_listado_codigo", "codigo"),
    "fondos_por_instrumento": ("tipo_institucion", "tipo_institucion"),
    "fondos_por_moneda_objeto": ("moneda_objeto", "moneda_objeto"),
    "fondos_por_agrupacion": ("agrupacion", "agrupacion_instrumentos"),
}


def _walk_filas(elem, ctx, listado_total_fondos: bool = False):
    """Generator de (ctx_dict, fila_elem) recorriendo el arbol y acumulando
    contexto al pasar por wrappers anidados."""
    for child in elem:
        local = _localname(child)
        if local == "fila":
            yield ctx, child
        elif local == "total_fondos":
            new_ctx = {**ctx, "sub_listado_codigo": "TOTAL"}
            yield from _walk_filas(child, new_ctx)
        elif local in _WRAPPERS_CTX:
            ctx_key, attr_key = _WRAPPERS_CTX[local]
            # Solo aplica si tiene el atributo (ej. <tipofondo codigo="A"> SI,
            # pero <tipofondo> dentro de <columnas> es una columna de valor, NO un wrapper).
            if attr_key in child.attrib:
                new_ctx = {**ctx, ctx_key: child.attrib[attr_key]}
                yield from _walk_filas(child, new_ctx)
            else:
                yield from _walk_filas(child, ctx)
        elif local in ("titulo", "subtitulo"):
            continue
        else:
            # Pass-through: listado_por_fondo, listado_por_afp, listado_por_instrumento
            yield from _walk_filas(child, ctx)


def _detect_col_type(columnas) -> str:
    """Devuelve 'tipofondo' | 'afp' | 'instrumento' segun el primer hijo no-total."""
    for col in columnas:
        local = _localname(col)
        if local in ("tipofondo", "afp", "instrumento"):
            return local
    return None


def _parse_fila(ctx, fila_elem):
    """(ctx, <fila>) -> (fila_dict, valores_fondo, valores_afp, valores_instrumento)."""
    glosa = _text(fila_elem.find("sp:glosa", SP_NS)) or ""

    fila = {
        **ctx,
        "fila_numero": int(fila_elem.attrib.get("numero", 0)),
        "glosa": glosa,
        "emisor": _text(fila_elem.find("sp:emisor", SP_NS)),
        "nemotecnico": _text(fila_elem.find("sp:nemotecnico", SP_NS)),
        "tipo_accion": _text(fila_elem.find("sp:tipo_accion", SP_NS)),
        "elegibilidad": _text(fila_elem.find("sp:elegibilidad", SP_NS)),
        "condicion": _text(fila_elem.find("sp:condicion", SP_NS)),
        "unidad_indexada": _text(fila_elem.find("sp:unidad_indexada", SP_NS)),
        "es_subtotal": glosa.strip().upper().startswith("TOTAL "),
    }

    valores_fondo = []
    valores_afp = []
    valores_instrumento = []

    columnas = fila_elem.find("sp:columnas", SP_NS)
    if columnas is None:
        return fila, valores_fondo, valores_afp, valores_instrumento

    col_type = _detect_col_type(columnas)

    for col in columnas:
        local = _localname(col)

        if local == "tipofondo" and "codigo" in col.attrib:
            valores_fondo.append({
                "tipo_fondo": col.attrib["codigo"],
                "monto_dolares": _num(col.find("sp:monto_dolares", SP_NS)),
                "monto_pesos": _num(col.find("sp:monto_pesos", SP_NS)),
                "porcentaje": _num(col.find("sp:porcentaje", SP_NS)),
                "porcentaje_sobre_emisor": _num(col.find("sp:porcentaje_sobre_emisor", SP_NS)),
                "porcentaje_sobre_extranjero": _num(col.find("sp:porcentaje_sobre_extranjero", SP_NS)),
            })

        elif local == "afp":
            rut_elem = col.find("sp:rut", SP_NS)
            if rut_elem is not None:
                numero = _text(rut_elem.find("sp:numero", SP_NS))
                dv = _text(rut_elem.find("sp:dv", SP_NS))
                rut = f"{numero}-{dv}" if numero and dv else (numero or "")
            else:
                rut = ""
            valores_afp.append({
                "afp_rut": rut,
                "afp_nombre": _text(col.find("sp:nombre", SP_NS)) or "",
                "monto_dolares": _num(col.find("sp:monto_dolares", SP_NS)),
                "porcentaje": _num(col.find("sp:porcentaje", SP_NS)),
            })

        elif local == "instrumento":
            valores_instrumento.append({
                "instrumento_glosa": _text(col.find("sp:glosa", SP_NS)) or "",
                "porcentaje": _num(col.find("sp:porcentaje", SP_NS)),
                "monto_pesos": _num(col.find("sp:monto_pesos", SP_NS)),
                "monto_dolares": _num(col.find("sp:monto_dolares", SP_NS)),
            })

        elif local == "total":
            # El <total> agrega segun el tipo de columnas hermanas
            if col_type == "tipofondo":
                valores_fondo.append({
                    "tipo_fondo": "TOTAL",
                    "monto_dolares": _num(col.find("sp:monto_dolares", SP_NS)),
                    "monto_pesos": _num(col.find("sp:monto_pesos", SP_NS)),
                    "porcentaje": _num(col.find("sp:porcentaje", SP_NS)),
                    "porcentaje_sobre_emisor": _num(col.find("sp:porcentaje_sobre_emisor", SP_NS)),
                    "porcentaje_sobre_extranjero": _num(col.find("sp:porcentaje_sobre_extranjero", SP_NS)),
                })
            elif col_type == "afp":
                valores_afp.append({
                    "afp_rut": "TOTAL",
                    "afp_nombre": "TOTAL",
                    "monto_dolares": _num(col.find("sp:monto_dolares", SP_NS)),
                    "porcentaje": _num(col.find("sp:porcentaje", SP_NS)),
                })
            elif col_type == "instrumento":
                valores_instrumento.append({
                    "instrumento_glosa": "TOTAL",
                    "porcentaje": _num(col.find("sp:porcentaje", SP_NS)),
                    "monto_pesos": _num(col.find("sp:monto_pesos", SP_NS)),
                    "monto_dolares": _num(col.find("sp:monto_dolares", SP_NS)),
                })

    return fila, valores_fondo, valores_afp, valores_instrumento


def parse_xml(xml_bytes: bytes) -> dict:
    """Parsea el XML completo y devuelve un dict listo para load_periodo()."""
    tree = ET.parse(io.BytesIO(xml_bytes))
    root = tree.getroot()

    periodo = _text(root.find(".//sp:encabezado/sp:periodo", SP_NS))
    fecha_pub = _text(root.find(".//sp:encabezado/sp:fecha_publicacion", SP_NS))
    if not periodo:
        raise ValueError("XML no contiene <encabezado>/<periodo>")

    # fecha_valor: extraer del primer <subtitulo> con patron "Al DD-MM-YYYY"
    fecha_valor = None
    for sub in root.iter():
        if _localname(sub) == "subtitulo":
            txt = (sub.text or "").strip()
            m = re.search(r"Al\s+(\d{2})-(\d{2})-(\d{4})", txt)
            if m:
                fecha_valor = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                break
    if not fecha_valor:
        raise ValueError("No se encontro fecha_valor en ningun <subtitulo>")

    rows = []
    for listado in root.findall("sp:listado", SP_NS):
        cuadro_num = int(listado.attrib.get("numero", 0))
        ctx = {
            "cuadro": cuadro_num,
            "sub_listado_codigo": None,
            "tipo_institucion": None,
            "moneda_objeto": None,
            "agrupacion": None,
        }
        for ctx_at_fila, fila_elem in _walk_filas(listado, ctx):
            fila, vf, va, vi = _parse_fila(ctx_at_fila, fila_elem)
            rows.append({
                "fila": fila,
                "valores_fondo": vf,
                "valores_afp": va,
                "valores_instrumento": vi,
            })

    return {
        "periodo": periodo,
        "fecha_valor": fecha_valor,
        "fecha_publicacion": fecha_pub,
        "rows": rows,
    }


# =============================================================
# LOAD A SUPABASE
# =============================================================

def delete_periodo(client: Client, periodo: str) -> int:
    """DELETE FROM sp_fila WHERE periodo = X. CASCADE limpia las 3 hijas."""
    resp = client.table("sp_fila").delete().eq("periodo", periodo).execute()
    return len(resp.data) if resp.data else 0


def _insert_batches(client: Client, table: str, rows: list, batch_size: int = 1000) -> int:
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), batch_size):
        client.table(table).insert(rows[i:i+batch_size]).execute()
        total += min(batch_size, len(rows) - i)
    return total


def load_periodo(client: Client, parsed: dict, batch_size: int = 500) -> dict:
    """DELETE + INSERT por periodo. Devuelve contadores."""
    periodo = parsed["periodo"]
    fecha_valor_iso = parsed["fecha_valor"].isoformat()
    fecha_pub = parsed["fecha_publicacion"]

    print(f"      borrando data previa de {periodo}...", flush=True)
    deleted = delete_periodo(client, periodo)
    print(f"      ({deleted:,} sp_fila previas borradas; cascade limpia las 3 hijas)")

    rows = parsed["rows"]
    if not rows:
        print(f"      WARNING: 0 filas parseadas")
        return {"filas": 0, "valor_fondo": 0, "valor_afp": 0, "valor_instrumento": 0}

    n_filas = 0
    n_vf = 0
    n_va = 0
    n_vi = 0

    # Insert por batches. Trust order: supabase-py preserva el orden del request
    # en response.data, asi se puede zip() para mapear fila_id -> valores.
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        fila_payload = [
            {
                "periodo": periodo,
                "fecha_valor": fecha_valor_iso,
                "fecha_publicacion": fecha_pub,
                **r["fila"],
            }
            for r in batch
        ]
        resp = client.table("sp_fila").insert(fila_payload).execute()
        inserted = resp.data or []
        if len(inserted) != len(batch):
            raise RuntimeError(
                f"Insert mismatch en sp_fila: enviados {len(batch)}, "
                f"recibidos {len(inserted)}"
            )

        vf, va, vi = [], [], []
        for parsed_row, ins in zip(batch, inserted):
            fila_id = ins["fila_id"]
            for v in parsed_row["valores_fondo"]:
                vf.append({"fila_id": fila_id, **v})
            for v in parsed_row["valores_afp"]:
                va.append({"fila_id": fila_id, **v})
            for v in parsed_row["valores_instrumento"]:
                vi.append({"fila_id": fila_id, **v})

        n_filas += len(inserted)
        n_vf += _insert_batches(client, "sp_valor_fondo", vf)
        n_va += _insert_batches(client, "sp_valor_afp", va)
        n_vi += _insert_batches(client, "sp_valor_instrumento", vi)

    print(
        f"      -> {n_filas:,} sp_fila | "
        f"{n_vf:,} valor_fondo | {n_va:,} valor_afp | {n_vi:,} valor_instrumento"
    )
    return {
        "filas": n_filas,
        "valor_fondo": n_vf,
        "valor_afp": n_va,
        "valor_instrumento": n_vi,
    }


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


def periodo_for_url(periodo: str) -> str:
    """'2025-11' -> '202511' (formato URL de SP)."""
    return periodo.replace("-", "")


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
    """Para los modos explicitos (--periodo / --start) devuelve lo pedido.
    Para incremental consulta SP y devuelve los ultimos LATEST_N_MONTHS
    realmente publicados (oldest first para que el load corra cronologico)."""
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
    # Incremental: ultimos N realmente publicados segun SP
    published = get_published_periodos_from_sp(session)
    if not published:
        raise RuntimeError("SP no devolvio ningun periodo en el dropdown")
    target = published[:LATEST_N_MONTHS]
    return list(reversed(target))  # oldest first


# =============================================================
# RESUMEN
# =============================================================

def print_summary(client: Client):
    print("\n--- Resumen tablas SP XML ---")
    for tbl in ("sp_fila", "sp_valor_fondo", "sp_valor_afp", "sp_valor_instrumento"):
        resp = client.table(tbl).select("*", count="exact").limit(1).execute()
        print(f"  {tbl:24s} {resp.count or 0:>10,} filas")

    # Min/max periodo (distinct count no es trivial via REST por el default limit
    # de 1000 filas; mostramos rango via dos queries chicas).
    asc = client.table("sp_fila").select("periodo").order("periodo", desc=False).limit(1).execute()
    dsc = client.table("sp_fila").select("periodo").order("periodo", desc=True).limit(1).execute()
    if asc.data and dsc.data:
        print(f"  rango periodos:  [{asc.data[0]['periodo']} -> {dsc.data[0]['periodo']}]")


# =============================================================
# MAIN
# =============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Sync XML cartera_agregada de SP -> Supabase via REST API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--periodo", help="Periodo unico (YYYY-MM o YYYYMM)")
    parser.add_argument("--start", help="Periodo inicio backfill (YYYY-MM o YYYYMM)")
    parser.add_argument("--end", help="Periodo fin backfill (default: mes anterior)")
    parser.add_argument(
        "--xml-file",
        help="Cargar desde archivo .xml local (no descarga). Requiere --periodo.",
    )
    parser.add_argument(
        "--no-prune",
        action="store_true",
        help=(
            "Modo incremental: NO borrar periodos viejos al refrescar la "
            "ventana. Por defecto incremental borra todo lo anterior al "
            "oldest del target. Usar este flag cuando hay backfill historico "
            "que se quiere preservar (ej. /asset-allocation evolution charts)."
        ),
    )
    args = parser.parse_args()

    if args.xml_file and not args.periodo:
        parser.error("--xml-file requiere --periodo")
    if args.xml_file and (args.start or args.end):
        parser.error("--xml-file es incompatible con --start/--end")

    start_time = datetime.now()
    print(f"Inicio: {start_time:%Y-%m-%d %H:%M:%S}")

    print("Conectando a Supabase REST API...")
    client = connect_supabase()
    print("Conexion OK\n")

    session = _new_session() if not args.xml_file else None

    incremental = not (args.periodo or args.start or args.xml_file)
    periodos = resolve_periodos(args, session=session)
    print(f"MODO: {'INCREMENTAL (ultimos publicados)' if incremental else 'EXPLICITO'}")
    print(f"Periodos a procesar ({len(periodos)}): {', '.join(periodos)}")

    # En modo incremental: ademas de cargar los N publicados, eliminar de
    # Supabase cualquier periodo viejo que ya no este en la ventana, asi el
    # estado refleja exactamente "ultimos 4 publicados".
    # `--no-prune` salta esta limpieza para preservar backfill historico
    # (ej. los meses 2025-01..2025-11 cargados para los charts evolutivos
    # de /asset-allocation).
    if incremental and not args.no_prune:
        oldest_target = min(periodos)
        resp = client.table("sp_fila").delete().lt("periodo", oldest_target).execute()
        n_drop = len(resp.data) if resp.data else 0
        if n_drop:
            print(f"Borrados {n_drop:,} sp_fila con periodo < {oldest_target} (cascade)")
    elif incremental and args.no_prune:
        print("Skipping prune (--no-prune): periodos historicos se preservan")
    print()

    # En modo incremental skipeamos meses no publicados (defensivo: aunque
    # `resolve_periodos` ya filtra por el dropdown, el ZIP puede no estar
    # listo aunque la pagina detalle exista).
    skipped = []

    try:
        for periodo in periodos:
            print(f"[periodo {periodo}]")
            t0 = time()

            try:
                if args.xml_file:
                    xml_bytes = Path(args.xml_file).read_bytes()
                    print(f"      leyendo {args.xml_file} ({len(xml_bytes):,} bytes)")
                else:
                    p_url = periodo_for_url(periodo)
                    print(f"      descargando ZIP de SP (periodo={p_url})...", flush=True)
                    xml_bytes = fetch_xml_for_periodo(p_url, session=session)
                    print(f"      ({len(xml_bytes):,} bytes XML)")
            except RuntimeError as e:
                msg = str(e)
                missing = (
                    "Obtener Aqui" in msg
                    or "Content-Type='text/html'" in msg  # ZIP no listo: SP devuelve HTML
                )
                if incremental and missing:
                    print(f"      SKIP: {periodo} no esta publicado todavia\n")
                    skipped.append(periodo)
                    continue
                raise

            print(f"      parseando XML...", flush=True)
            parsed = parse_xml(xml_bytes)
            if parsed["periodo"] != periodo:
                print(
                    f"      WARNING: periodo del XML ({parsed['periodo']}) "
                    f"!= esperado ({periodo}). Usando el del XML."
                )

            load_periodo(client, parsed)
            print(f"      done en {time()-t0:.1f}s\n")

        if skipped:
            print(f"Periodos no publicados todavia: {', '.join(skipped)}\n")
        print_summary(client)
    except requests.HTTPError as e:
        print(f"\n[ERROR HTTP] {e}", file=sys.stderr)
        raise
    except Exception as e:
        print(f"\n[ERROR] {e}", file=sys.stderr)
        raise

    elapsed = datetime.now() - start_time
    print(f"\nSync completado en {elapsed.total_seconds():.1f}s")


if __name__ == "__main__":
    main()
