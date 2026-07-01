"""
Sync del detalle de cartera CON desfase (por AFP, pre-clasificado) SQL Server -> Supabase:
  Inteligencia_Mercado.dbo.AFP_CL_CHIST_ADJUSTED  ->  chist_adjusted

Unico nivel con detalle por-AFP x instrumento. `supracategory` ya viene clasificada;
`tipo_valor` = Valorizacion (NAV) / Remanente (uncalled, solo bajo Fondos).

Ventana 2025+ y EXCLUSION de buckets (free tier): Direct Inv. RF Nacional, Derivados
Nacional/Extranjero, Disponible Nacional -> sus totales salen de sd_asset_class_*.
Columnas forward/swap no se traen. Idempotente: DELETE por fecha en el pull + INSERT.

Requiere que la tabla destino exista (ver chist_adjusted_schema.sql).

Uso:
    python sync/sync_chist_adjusted.py                 # ventana default 2025-01-01
    python sync/sync_chist_adjusted.py --start 2026-01-01
    python sync/sync_chist_adjusted.py --dry-run
"""
import os
import sys
import argparse

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sync_sqlserver_to_supabase import (  # noqa: E402
    connect_sqlserver,
    connect_supabase,
    supabase_insert,
    supabase_delete_in,
    timed_read,
)

load_dotenv()

SRC_TABLE = 'AFP_CL_CHIST_ADJUSTED'
DST_TABLE = 'chist_adjusted'
WINDOW = '2025-01-01'
EXCLUDE = (
    "'Direct Inv. RF Nacional', 'Derivados Nacional', "
    "'Derivados Extranjero', 'Disponible Nacional'"
)


def build_query(start):
    return f"""
        SELECT CAST(FechaReporte AS DATE)        AS fecha_reporte,
               CAST(fecha AS DATE)               AS fecha,
               afp                               AS afp,
               tipo_de_fondo                     AS tipo_de_fondo,
               tipo_de_instrumento               AS tipo_de_instrumento,
               nemotecnico_del_instrumento       AS nemotecnico,
               nombre_del_emisor                 AS nombre_del_emisor,
               nacionalidad_del_emisor           AS nacionalidad_del_emisor,
               unidades                          AS unidades,
               precio                            AS precio,
               inversion                         AS inversion,
               Supracategory                     AS supracategory,
               [Type]                            AS tipo_valor
        FROM Inteligencia_Mercado.dbo.{SRC_TABLE}
        WHERE fecha >= '{start}'
          AND Supracategory NOT IN ({EXCLUDE})
    """


def main():
    ap = argparse.ArgumentParser(description="Sync AFP_CL_CHIST_ADJUSTED -> Supabase chist_adjusted")
    ap.add_argument('--start', default=WINDOW, help=f'Inicio YYYY-MM-DD por fecha (default {WINDOW})')
    ap.add_argument('--dry-run', action='store_true', help='Solo lee de SQL y reporta; no escribe en Supabase')
    args = ap.parse_args()

    eng = connect_sqlserver()
    print(f"\n[chist_adjusted] {DST_TABLE} <- {SRC_TABLE}  [fecha >= {args.start}, sin derivados/RF-nac/disp-nac]")
    df = timed_read(DST_TABLE, eng, build_query(args.start))
    if df.empty:
        print("      -> 0 filas (nada en el rango)")
        return

    fechas = sorted(df['fecha'].unique().tolist())
    print(f"      leidas {len(df):,} filas en {len(fechas)} fechas [{fechas[0]} .. {fechas[-1]}]")
    print("      Supracategory: " + ", ".join(f"{k}={v}" for k, v in df['supracategory'].value_counts().items()))
    print("      tipo_valor:    " + ", ".join(f"{k}={v}" for k, v in df['tipo_valor'].value_counts().items()))

    if args.dry_run:
        print("      DRY-RUN: no se escribe nada en Supabase.")
        return

    sb = connect_supabase()
    deleted = supabase_delete_in(sb, DST_TABLE, 'fecha', fechas)
    print(f"      ({deleted:,} filas borradas en {len(fechas)} fechas previas)")
    n = supabase_insert(sb, DST_TABLE, df, batch_size=500, show_progress=True)
    print(f"      -> {n:,} filas insertadas")

    got = sb.table(DST_TABLE).select('fila_id', count='exact').limit(1).execute()
    print(f"      verificacion: {got.count:,} filas en Supabase (esperado >= {len(df):,})")

    # chist_adjusted feeds mv_chist_aa (snapshot behind v_total/v_nav/v_uncalled/...).
    # Refresh it so the dashboard doesn't read stale alternatives after this sync.
    print("      refrescando matviews del dashboard (mv_chist_aa, mv_aum)...")
    sb.rpc('refresh_alternatives_matviews').execute()
    print("      -> matviews refrescados")
    print("\n=== DONE ===")


if __name__ == '__main__':
    main()
