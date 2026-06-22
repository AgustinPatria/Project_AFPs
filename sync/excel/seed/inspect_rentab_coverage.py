"""Diagnostico READ-ONLY: cobertura de la hoja Rentab (11_Flows03.xlsm).
1) Rango de meses y tickers de la serie de retornos acumulada.
2) Cobertura por monto USD vs las posiciones foreign de Nov-25 en Supabase.
"""
import os
from collections import defaultdict
from pathlib import Path

import openpyxl
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

XLSM = (
    Path(__file__).resolve().parents[3]
    / "Excels construccion pdf" / "202511" / "11_Flows03.xlsm"
)


def main():
    wb = openpyxl.load_workbook(XLSM, read_only=True, data_only=True)
    ws = wb["Rentab"]
    por_mes = defaultdict(int)
    nemos = set()
    n = 0
    for row in ws.iter_rows(min_row=2, max_col=5, values_only=True):
        start, end, nemo, ticker, ret = row
        if nemo is None or end is None or not isinstance(ret, (int, float)):
            continue
        n += 1
        por_mes[str(end)[:7]] += 1
        nemos.add(str(nemo).strip().upper())
    wb.close()

    meses = sorted(por_mes)
    print(f"Rentab: {n} filas validas, {len(nemos)} nemos/ISINs distintos")
    print(f"Meses: {meses[0]} .. {meses[-1]} ({len(meses)} meses)")
    print("Filas por mes (primeros 3 / ultimos 3):")
    for m in meses[:3] + meses[-3:]:
        print(f"   {m}: {por_mes[m]}")

    # Cobertura vs posiciones SP Nov-25 (via Supabase REST, solo lectura)
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows = (
        sb.table("v_sp_foreign_classified")
        .select("isin,monto_dolares,asset_class,fund_id")
        .eq("periodo", "2025-11")
        .limit(10000)
        .execute()
        .data
    )
    print(f"\nPosiciones SP Nov-25: {len(rows)} filas")
    tot = defaultdict(float)
    cub = defaultdict(float)
    for r in rows:
        ac = r["asset_class"] or ("(sin fund - direct inv)" if r["fund_id"] is None else "(sin AC)")
        m = float(r["monto_dolares"])
        tot[ac] += m
        if (r["isin"] or "").strip().upper() in nemos:
            cub[ac] += m
    print(f"\n{'asset_class':<28} {'usd_total':>10} {'usd_con_ret':>12} {'cobertura':>9}")
    for ac in sorted(tot, key=lambda k: -tot[k]):
        pct = 100 * cub[ac] / tot[ac] if tot[ac] else 0
        print(f"{ac:<28} {tot[ac]:>10,.0f} {cub[ac]:>12,.0f} {pct:>8.1f}%")
    t, c = sum(tot.values()), sum(cub.values())
    print(f"{'TOTAL':<28} {t:>10,.0f} {c:>12,.0f} {100*c/t:>8.1f}%")


if __name__ == "__main__":
    main()
