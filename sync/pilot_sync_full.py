"""
Pilot sync: carga el universo COMPLETO de TBL_SPE_HISTORIAL_CARTERAS
(sin filtro Filtro1='Si') a una tabla nueva 'historial_carteras_full'
para validar contra SP cuadros 1, 8, 18, 26 antes de migrar la tabla
productiva.

NO TOCA `historial_carteras` actual ni las vistas existentes.

PREREQUISITO (correr una vez en Supabase SQL editor):
    CREATE TABLE historial_carteras_full
    (LIKE historial_carteras INCLUDING ALL);

Para rangos > 1 mes, el script itera mes-a-mes (progreso visible y RAM baja).
Es idempotente: cada mes hace DELETE + INSERT por fecha_reporte, asi que
re-correr sobre data ya cargada simplemente la reescribe.

Uso:
    python sync/pilot_sync_full.py                       # default: Nov 2025
    python sync/pilot_sync_full.py --start 2025-11-01 --end 2025-11-30
    python sync/pilot_sync_full.py --start 2020-01-01 --end 2025-10-31
"""
import os
import sys
import argparse
from time import time

import pandas as pd
from dotenv import load_dotenv

# Reusar helpers del sync principal
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sync_sqlserver_to_supabase import (  # noqa: E402
    connect_sqlserver, connect_supabase,
    supabase_insert, supabase_delete_in,
    timed_read,
)

load_dotenv()


def month_chunks(start_str, end_str):
    """Yield (month_start, month_end) tuples cubriendo [start, end] por mes."""
    start = pd.Timestamp(start_str)
    end = pd.Timestamp(end_str)
    cur = start.replace(day=1)
    while cur <= end:
        next_month_start = cur + pd.offsets.MonthBegin(1)
        month_end = next_month_start - pd.Timedelta(days=1)
        chunk_start = max(start, cur)
        chunk_end = min(end, month_end)
        yield chunk_start.strftime('%Y-%m-%d'), chunk_end.strftime('%Y-%m-%d')
        cur = next_month_start


def sync_pilot(ms_engine, client, start, end, table='historial_carteras_full'):
    print(f"\n[pilot] {table}  [{start} -> {end}]")
    t0 = time()

    # SELECT con filter restrictivo para mantener Supabase bajo el free tier.
    # Insertamos solo lo que el dashboard usa:
    #   - foreign holdings (Sec 07/08/10)
    #   - chilean ACC (Sec 06 Transactions, Local Equity DI)
    #   - chilean CFIV/CFMV (Local Equity Investment Funds — Sec 04 page 2)
    #   - alts (Filtro1='Si') — para v_chist_aa y módulo legacy /
    # Esto baja la data de ~2.47M a ~1.27M rows (~534MB → ~199MB).
    query = f"""
        SELECT
            CAST(h.FechaReporte AS DATE) AS fecha_reporte,
            CAST(h.fecha AS DATE) AS fecha,
            h.afp, h.tipo_de_fondo, h.tipo_de_instrumento,
            h.nemotecnico_del_instrumento, h.nombre_del_emisor,
            h.nacionalidad_del_emisor, h.unidad_de_reajuste_de_moneda,
            h.unidades, h.precio, h.inversion, h.grupo_economico,
            h.moneda_contrato_forward, h.moneda_objeto_forward,
            h.precio_ejercicio_forward, h.plazo_economico,
            h.tasa_pactada_del_fondo_swap, h.tasa_pactada_de_la_contraparte_s
        FROM Inteligencia_Mercado.dbo.TBL_SPE_HISTORIAL_CARTERAS h
        WHERE h.FechaReporte >= '{start}'
          AND h.FechaReporte <= '{end}'
          AND (
            h.nacionalidad_del_emisor = 'E'
            OR h.tipo_de_instrumento IN ('ACC','CFIV','CFMV')
            OR h.tipo_de_instrumento IN (
              SELECT f.tipo_de_instrumento
              FROM Inteligencia_Mercado.dbo.AFP_CL_DIM_TipoInstrumentoF1 f
              WHERE f.Filtro1 = 'Si'
            )
          )
    """
    df = timed_read(table, ms_engine, query)

    if df.empty:
        print("      -> 0 filas (no hay data en el rango)")
        return 0

    cols_order = [
        'fecha', 'afp', 'tipo_de_fondo', 'tipo_de_instrumento',
        'nemotecnico_del_instrumento', 'nombre_del_emisor',
        'nacionalidad_del_emisor', 'unidad_de_reajuste_de_moneda',
        'unidades', 'precio', 'inversion', 'grupo_economico',
        'moneda_contrato_forward', 'moneda_objeto_forward',
        'precio_ejercicio_forward', 'plazo_economico',
        'tasa_pactada_del_fondo_swap', 'tasa_pactada_de_la_contraparte_s',
        'fecha_reporte',
    ]
    df = df[cols_order]

    # Idempotente: borra fechas presentes en el nuevo pull antes de insertar
    fechas = sorted(df['fecha_reporte'].unique().tolist())
    print(f"      borrando {len(fechas)} fecha(s) previas en {table}...", flush=True)
    deleted = supabase_delete_in(client, table, 'fecha_reporte', fechas)
    print(f"      ({deleted:,} filas borradas)")

    n = supabase_insert(client, table, df, batch_size=500, show_progress=True)
    print(f"      -> {n:,} filas insertadas (total: {time() - t0:.1f}s)")
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--start', default='2025-11-01',
                    help='Inicio del rango (YYYY-MM-DD). Default: 2025-11-01')
    ap.add_argument('--end', default='2025-11-30',
                    help='Fin del rango (YYYY-MM-DD). Default: 2025-11-30')
    ap.add_argument('--table', default='historial_carteras_full',
                    help='Tabla destino (default: historial_carteras_full)')
    args = ap.parse_args()

    ms_engine = connect_sqlserver()
    client = connect_supabase()

    chunks = list(month_chunks(args.start, args.end))
    print(f"\nProcesando {len(chunks)} mes(es) en chunks separados "
          f"(progreso visible, RAM baja)\n")
    t0_total = time()
    total_rows = 0
    for i, (cs, ce) in enumerate(chunks, 1):
        print(f"--- mes {i}/{len(chunks)} ---")
        try:
            n = sync_pilot(ms_engine, client, cs, ce, args.table)
            total_rows += n or 0
        except Exception as e:
            print(f"\n[ERROR] mes {cs}->{ce} fallo: {e}")
            print(f"        re-correlo despues con: --start {cs} --end {ce}")
            raise
    print(f"\n=== DONE: {total_rows:,} filas en {time() - t0_total:.0f}s "
          f"({len(chunks)} mes(es)) ===")


if __name__ == '__main__':
    main()
