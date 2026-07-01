"""Mirror SQL Server -> Supabase de los retornos Bloomberg foreign (Sec 07).

⚠️ DEPRECADO 2026-06-26 — la tabla destino `bbg_returns_foreign` fue dropeada de
Supabase. Los retornos Bloomberg ahora se sincronizan con `sync/sync_bbg_returns.py`
(fuente `AFP_CL_BBG_Returns`, destino `bbg_returns`). Las flows de /foreign leen
`bbg_returns`. Este script se deja como referencia pero se auto-bloquea al ejecutar.

Fuente:  Inteligencia_Mercado.dbo.AFP_CL_BBG_Returns_Foreign (historia completa 2021-07+)
Destino: Supabase tabla bbg_returns_foreign (ventana >= 2025-01-01 solamente)

Upsert idempotente sobre PK (fecha, nemo) via REST API (HTTPS/443 — la red Patria
bloquea los puertos Postgres). Re-ejecutable cada mes despues de refrescar la tabla
en SQL Server con sync/excel/seed/extract_bbg_returns.py.

Uso:
  python sync/sync_bbg_returns_to_supabase.py                # ventana default >= 2025-01-01
  python sync/sync_bbg_returns_to_supabase.py --desde 2026-01-01
"""
import argparse
import os
from pathlib import Path

import pyodbc
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DESDE_DEFAULT = "2025-01-01"
BATCH = 1000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", default=DESDE_DEFAULT)
    ap.add_argument("--force", action="store_true",
                    help="Override del bloqueo de deprecación (requiere recrear bbg_returns_foreign).")
    args = ap.parse_args()

    if not args.force:
        import sys
        sys.exit(
            "DEPRECADO: `bbg_returns_foreign` fue dropeada (2026-06-26). Usá "
            "sync/sync_bbg_returns.py -> tabla `bbg_returns`. Pasá --force solo si "
            "recreaste bbg_returns_foreign a propósito."
        )

    cn = pyodbc.connect(
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={os.environ['DB_SERVER']};DATABASE={os.environ['DB_DATABASE']};"
        f"UID={os.environ['DB_UID']};PWD={os.environ['DB_PWD']};"
        "Encrypt=optional;TrustServerCertificate=yes;"
    )
    cur = cn.cursor()
    cur.execute(
        """
        SELECT Fecha, Nemo, TickerBBG, RetUSD_Pct
        FROM dbo.AFP_CL_BBG_Returns_Foreign
        WHERE Fecha >= ?
        ORDER BY Fecha, Nemo
        """,
        args.desde,
    )
    rows = [
        {
            "fecha": r.Fecha.isoformat(),
            "nemo": r.Nemo,
            "ticker_bbg": r.TickerBBG,
            "ret_usd_pct": r.RetUSD_Pct,
        }
        for r in cur.fetchall()
    ]
    cn.close()
    print(f"SQL Server: {len(rows)} filas con Fecha >= {args.desde}")

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    for i in range(0, len(rows), BATCH):
        sb.table("bbg_returns_foreign").upsert(
            rows[i : i + BATCH], on_conflict="fecha,nemo"
        ).execute()
        print(f"  upsert {i + 1}..{min(i + BATCH, len(rows))}")

    chk = (
        sb.table("bbg_returns_foreign")
        .select("fecha", count="exact")
        .limit(1)
        .execute()
    )
    print(f"Supabase bbg_returns_foreign: {chk.count} filas totales")


if __name__ == "__main__":
    main()
