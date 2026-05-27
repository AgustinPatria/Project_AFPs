"""
Sync SQL Server (Inteligencia_Mercado.dbo.AFP_CL_SP_*) -> Supabase (sp_*, cotizantes_afp).

SQL Server es source of truth con historia completa. Supabase es el backend
que sirve al dashboard y mantiene solo la "ventana viva" de datos.

VENTANA
=======
Solo periodos >= 2025-01 (y fechas >= 2025-01-01 para cotizantes) viajan a
Supabase. Decision del usuario para mantener el free tier holgado. Si en el
futuro se quiere extender, ajustar WINDOW_START_*.

TABLAS Y ESTRATEGIA
===================
  AFP_CL_SP_Fila              -> sp_fila               (DELETE+INSERT por periodo, CASCADE limpia hijas)
  AFP_CL_SP_Valor_Fondo       -> sp_valor_fondo
  AFP_CL_SP_Valor_AFP         -> sp_valor_afp
  AFP_CL_SP_Valor_Instrumento -> sp_valor_instrumento
  AFP_CL_SP_Cotizantes        -> cotizantes_afp        (DELETE WHERE fecha >= window + INSERT todo)

IDs PRESERVADOS
===============
fila_id se copia 1:1 de SQL Server (no se regenera). El BIGSERIAL de Supabase
permite override explicito; Postgres no auto-incrementa cuando se pasa el
valor. Esto facilita debugging (mismo ID en ambos DBs).

MODOS DE EJECUCION
==================

1) DEFAULT - sincroniza todos los periodos en la ventana:

       python sync_sp_sqlserver_to_supabase.py

2) PERIODO unico:

       python sync_sp_sqlserver_to_supabase.py --periodo 2025-11
       python sync_sp_sqlserver_to_supabase.py --periodo 202511

3) Solo cotizantes / solo XML:

       python sync_sp_sqlserver_to_supabase.py --skip-cotizantes
       python sync_sp_sqlserver_to_supabase.py --only-cotizantes

VARIABLES REQUERIDAS EN .env
============================
  DB_SERVER, DB_DATABASE, DB_UID, DB_PWD     (SQL Server)
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY    (Supabase REST API)
"""

import os
import sys
import argparse
import urllib.parse
from datetime import datetime
from decimal import Decimal
from time import time

import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()


# =============================================================
# CONFIG
# =============================================================

WINDOW_START_PERIODO = "2025-01"      # sp_*: filtro f.periodo >= esto
WINDOW_START_FECHA   = "2025-01-01"   # cotizantes_afp: filtro fecha >= esto

# Batch a Supabase. supabase-py serializa todo el batch en un POST; batches
# muy grandes pueden chocar contra el body size limit. 500 es seguro.
SB_BATCH = 500


# =============================================================
# CONEXIONES
# =============================================================

def connect_sqlserver():
    """Engine SQLAlchemy contra Inteligencia_Mercado via ODBC Driver 18."""
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
    print(f"  SQL Server: {server} / {database}")
    return create_engine(f"mssql+pyodbc:///?odbc_connect={params}")


def connect_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not all([url, key]):
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env")
    print(f"  Supabase:   {url}")
    return create_client(url, key)


# =============================================================
# HELPERS
# =============================================================

def normalize_periodo(s: str) -> str:
    """'202511' | '2025-11' | '2025/11' -> '2025-11'."""
    s = s.strip().replace("/", "-")
    if len(s) == 7 and s[4] == "-":
        return s
    if len(s) == 6:
        return f"{s[:4]}-{s[4:]}"
    raise ValueError(f"Periodo invalido: {s!r}")


def _json_safe(v):
    """Convierte tipos no-JSON a sus equivalentes serializables.
    Trampa principal: float NaN. df.where(pd.notnull, None) NO funciona en
    columnas float64 porque pandas re-coerciona None -> NaN al guardarlo en
    el array. Hay que filtrar por valor con pd.isna()."""
    if v is None:
        return None
    try:
        if pd.isna(v):    # cubre NaN, NaT, pd.NA
            return None
    except (TypeError, ValueError):
        pass    # pd.isna falla con tipos exoticos (arrays, etc) — pasamos
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, bool):
        return v
    if hasattr(v, "isoformat"):    # datetime.date / datetime / pd.Timestamp
        return v.isoformat()
    return v


def _rows_to_dicts(df: pd.DataFrame) -> list:
    """DataFrame -> list[dict] con tipos JSON-safe."""
    out = []
    for r in df.to_dict(orient="records"):
        out.append({k: _json_safe(v) for k, v in r.items()})
    return out


def cleanup_out_of_window(client: Client) -> None:
    """Borra de Supabase los periodos < WINDOW_START_PERIODO (data heredada del
    pipeline viejo que escribia directo). One-shot al inicio del mirror."""
    print(f"[cleanup] borrando sp_* con periodo < {WINDOW_START_PERIODO} y "
          f"cotizantes con fecha < {WINDOW_START_FECHA}")
    resp = client.table("sp_fila").delete().lt("periodo", WINDOW_START_PERIODO).execute()
    n_fila = len(resp.data) if resp.data else 0
    if n_fila:
        print(f"      {n_fila:,} sp_fila viejas borradas (cascade hijas)")
    resp = client.table("cotizantes_afp").delete().lt("fecha", WINDOW_START_FECHA).execute()
    n_cot = len(resp.data) if resp.data else 0
    if n_cot:
        print(f"      {n_cot:,} cotizantes_afp viejos borrados")
    if not (n_fila or n_cot):
        print(f"      nada fuera de ventana")
    print()


def _insert_batches(client: Client, table: str, rows: list, batch_size: int = SB_BATCH) -> int:
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), batch_size):
        client.table(table).insert(rows[i:i + batch_size]).execute()
        total += min(batch_size, len(rows) - i)
    return total


# =============================================================
# SYNC sp_fila + 3 hijas
# =============================================================

# Columnas exactas a copiar (excluyo created_at: Supabase pone el suyo via default)
SP_FILA_COLS = [
    "fila_id", "periodo", "fecha_valor", "fecha_publicacion",
    "cuadro", "sub_listado_codigo", "fila_numero", "glosa",
    "tipo_institucion", "moneda_objeto", "agrupacion",
    "emisor", "nemotecnico", "tipo_accion",
    "elegibilidad", "condicion", "unidad_indexada", "es_subtotal",
]
SP_VF_COLS = [
    "fila_id", "tipo_fondo",
    "monto_dolares", "monto_pesos", "porcentaje",
    "porcentaje_sobre_emisor", "porcentaje_sobre_extranjero",
]
SP_VA_COLS = [
    "fila_id", "afp_rut", "afp_nombre",
    "monto_dolares", "porcentaje",
]
SP_VI_COLS = [
    "fila_id", "instrumento_glosa",
    "porcentaje", "monto_pesos", "monto_dolares",
]


def get_target_periodos(engine, override: str = None) -> list:
    """Periodos a sincronizar: todo en SQL Server >= WINDOW_START_PERIODO,
    o solo `override` si esta dado. Oldest first para que el log se vea claro."""
    if override:
        return [override]
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT DISTINCT periodo
            FROM dbo.AFP_CL_SP_Fila
            WHERE periodo >= '{WINDOW_START_PERIODO}'
            ORDER BY periodo
        """)).fetchall()
    return [r[0] for r in rows]


def sync_periodo(engine, client: Client, periodo: str) -> dict:
    """Mirror un periodo completo. Asume que en SQL Server esta finalizado."""
    print(f"[periodo {periodo}]")
    t0 = time()

    # === 1. LECTURA SQL SERVER ===
    with engine.connect() as conn:
        df_fila = pd.read_sql_query(
            text(f"""
                SELECT {', '.join(SP_FILA_COLS)}
                FROM dbo.AFP_CL_SP_Fila
                WHERE periodo = :p
            """),
            conn, params={"p": periodo},
        )
        if df_fila.empty:
            print(f"      SKIP: 0 filas en SQL Server")
            return {"filas": 0, "vf": 0, "va": 0, "vi": 0}

        fila_ids = tuple(int(x) for x in df_fila["fila_id"].tolist())
        # SQL Server no acepta tupla vacia con IN ();
        # ya saltamos arriba si esta vacio.
        in_clause = f"({', '.join(str(x) for x in fila_ids)})"

        df_vf = pd.read_sql_query(
            text(f"SELECT {', '.join(SP_VF_COLS)} FROM dbo.AFP_CL_SP_Valor_Fondo WHERE fila_id IN {in_clause}"),
            conn,
        )
        df_va = pd.read_sql_query(
            text(f"SELECT {', '.join(SP_VA_COLS)} FROM dbo.AFP_CL_SP_Valor_AFP WHERE fila_id IN {in_clause}"),
            conn,
        )
        df_vi = pd.read_sql_query(
            text(f"SELECT {', '.join(SP_VI_COLS)} FROM dbo.AFP_CL_SP_Valor_Instrumento WHERE fila_id IN {in_clause}"),
            conn,
        )

    # SQL Server BIT viene como int 0/1; Supabase espera bool. Casteamos.
    if "es_subtotal" in df_fila.columns:
        df_fila["es_subtotal"] = df_fila["es_subtotal"].astype(bool)

    print(
        f"      SQL:  {len(df_fila):,} fila | "
        f"{len(df_vf):,} vf | {len(df_va):,} va | {len(df_vi):,} vi"
    )

    # === 2. DELETE EN SUPABASE (CASCADE limpia las 3 hijas) ===
    resp = client.table("sp_fila").delete().eq("periodo", periodo).execute()
    deleted = len(resp.data) if resp.data else 0
    if deleted:
        print(f"      Supa: {deleted:,} sp_fila previas borradas")

    # === 3. INSERT EN SUPABASE ===
    n_filas = _insert_batches(client, "sp_fila",            _rows_to_dicts(df_fila))
    n_vf    = _insert_batches(client, "sp_valor_fondo",     _rows_to_dicts(df_vf))
    n_va    = _insert_batches(client, "sp_valor_afp",       _rows_to_dicts(df_va))
    n_vi    = _insert_batches(client, "sp_valor_instrumento", _rows_to_dicts(df_vi))

    print(
        f"      Ins:  {n_filas:,} fila | "
        f"{n_vf:,} vf | {n_va:,} va | {n_vi:,} vi  ({time()-t0:.1f}s)\n"
    )
    return {"filas": n_filas, "vf": n_vf, "va": n_va, "vi": n_vi}


# =============================================================
# SYNC cotizantes
# =============================================================

def sync_cotizantes(engine, client: Client) -> int:
    """Sincroniza la ventana entera de un saque (es chiquita: 7 filas/mes)."""
    print(f"[cotizantes >= {WINDOW_START_FECHA}]")
    t0 = time()
    with engine.connect() as conn:
        df = pd.read_sql_query(
            text(f"""
                SELECT fecha, afp, n_cotizantes
                FROM dbo.AFP_CL_SP_Cotizantes
                WHERE fecha >= '{WINDOW_START_FECHA}'
                ORDER BY fecha, afp
            """),
            conn,
        )

    if df.empty:
        print(f"      SKIP: 0 filas en SQL Server\n")
        return 0

    print(f"      SQL:  {len(df):,} filas")

    # DELETE rango entero + INSERT (mas simple que per-fecha)
    resp = client.table("cotizantes_afp").delete().gte("fecha", WINDOW_START_FECHA).execute()
    deleted = len(resp.data) if resp.data else 0
    if deleted:
        print(f"      Supa: {deleted:,} cotizantes_afp previas borradas")

    n = _insert_batches(client, "cotizantes_afp", _rows_to_dicts(df))
    print(f"      Ins:  {n:,} filas  ({time()-t0:.1f}s)\n")
    return n


# =============================================================
# RESUMEN
# =============================================================

def print_summary(client: Client):
    print("--- Resumen Supabase tras sync ---")
    for tbl in ("sp_fila", "sp_valor_fondo", "sp_valor_afp", "sp_valor_instrumento", "cotizantes_afp"):
        resp = client.table(tbl).select("*", count="exact").limit(1).execute()
        print(f"  {tbl:24s} {resp.count or 0:>10,} filas")

    asc = client.table("sp_fila").select("periodo").order("periodo", desc=False).limit(1).execute()
    dsc = client.table("sp_fila").select("periodo").order("periodo", desc=True).limit(1).execute()
    if asc.data and dsc.data:
        print(f"  rango sp_fila:           [{asc.data[0]['periodo']} -> {dsc.data[0]['periodo']}]")


# =============================================================
# MAIN
# =============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Sync SQL Server AFP_CL_SP_* -> Supabase sp_* (ventana >= 2025-01)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--periodo", help="Solo este periodo (YYYY-MM o YYYYMM)")
    parser.add_argument("--skip-cotizantes", action="store_true", help="No sincronizar cotizantes_afp")
    parser.add_argument("--only-cotizantes", action="store_true", help="Solo sincronizar cotizantes_afp")
    args = parser.parse_args()

    if args.skip_cotizantes and args.only_cotizantes:
        parser.error("--skip-cotizantes y --only-cotizantes son incompatibles")

    start_time = datetime.now()
    print(f"Inicio: {start_time:%Y-%m-%d %H:%M:%S}")
    print("Conexiones:")
    engine = connect_sqlserver()
    client = connect_supabase()
    print()

    # Cleanup one-shot de data fuera de ventana, solo si NO es periodo unico.
    if not args.periodo:
        cleanup_out_of_window(client)

    if not args.only_cotizantes:
        override = normalize_periodo(args.periodo) if args.periodo else None
        periodos = get_target_periodos(engine, override=override)
        print(f"Periodos sp_* a sincronizar ({len(periodos)}): {', '.join(periodos)}\n")
        for p in periodos:
            sync_periodo(engine, client, p)

    if not args.skip_cotizantes:
        sync_cotizantes(engine, client)

    print_summary(client)
    elapsed = datetime.now() - start_time
    print(f"\nSync completado en {elapsed.total_seconds():.1f}s")


if __name__ == "__main__":
    main()
