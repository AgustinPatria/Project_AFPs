"""Extrae la hoja Rentab de 11_Flows03.xlsm (retornos mensuales USD por
instrumento foreign, bajados de Bloomberg por el proceso legacy) y la deja
lista para cargar a SQL Server dbo.AFP_CL_BBG_Returns_Foreign.

Modos:
  python extract_bbg_returns.py preview   # stats + CSV validacion/bbg_returns_preview.csv (NO toca DBs)
  python extract_bbg_returns.py load      # DELETE+INSERT idempotente en SQL Server (pide --yes)

La fila de la hoja es: StartDate | EndDate | Nemo_SP | ISIN_Ticker | USD Ret
- USD Ret viene en PUNTOS PORCENTUALES (0.34 = +0.34% en el mes).
- Filas con ret no numerico ("--", vacio) se descartan.
- Duplicados (EndDate, Nemo): se conserva la ultima aparicion y se reporta.
"""
import csv
import os
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

import openpyxl

REPO = Path(__file__).resolve().parents[3]
XLSM = REPO / "Excels construccion pdf" / "202603" / "11_Flows03.xlsm"
OUT_CSV = REPO / "validacion" / "bbg_returns_preview.csv"
TABLE = "dbo.AFP_CL_BBG_Returns_Foreign"


def leer_rentab():
    wb = openpyxl.load_workbook(XLSM, read_only=True, data_only=True)
    ws = wb["Rentab"]
    rows = {}          # (fecha, nemo) -> (ticker, ret)
    dups_conflicto = 0
    descartadas = 0
    for row in ws.iter_rows(min_row=2, max_col=5, values_only=True):
        _start, end, nemo, ticker, ret = row
        if nemo is None or end is None or not isinstance(ret, (int, float)):
            descartadas += 1
            continue
        if isinstance(end, datetime):
            end = end.date()
        elif not isinstance(end, date):
            descartadas += 1
            continue
        nemo = str(nemo).strip()
        ticker = str(ticker).strip() if ticker is not None else None
        key = (end, nemo.upper())
        if key in rows and abs(rows[key][1] - float(ret)) > 1e-9:
            dups_conflicto += 1
        rows[key] = (ticker, float(ret))
    wb.close()
    out = [(f, n, t, r) for (f, n), (t, r) in sorted(rows.items())]
    return out, descartadas, dups_conflicto


def preview():
    rows, descartadas, dups = leer_rentab()
    por_mes = defaultdict(int)
    nemos = set()
    for f, n, _t, _r in rows:
        por_mes[f.strftime("%Y-%m")] += 1
        nemos.add(n)
    meses = sorted(por_mes)
    print(f"Filas a cargar: {len(rows)}  (descartadas sin retorno: {descartadas}, dups con conflicto: {dups})")
    print(f"Nemos/ISINs distintos: {len(nemos)}")
    print(f"Meses: {meses[0]} .. {meses[-1]} ({len(meses)})")
    print("\nFilas por mes (primeros 3 / ultimos 5):")
    for m in meses[:3] + meses[-5:]:
        print(f"   {m}: {por_mes[m]}")
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["fecha", "nemo", "ticker_bbg", "ret_usd_pct"])
        for f, n, t, r in rows:
            w.writerow([f.isoformat(), n, t, round(r, 8)])
    print(f"\nPreview CSV -> {OUT_CSV}")
    print("\nMuestra (5 primeras / 5 ultimas):")
    for f, n, t, r in rows[:5] + rows[-5:]:
        print(f"   {f} | {n:<14} | {str(t):<22} | {r:>10.4f}")


def load():
    if "--yes" not in sys.argv:
        print("Carga a SQL Server requiere flag --yes (confirmacion explicita).")
        sys.exit(1)
    import pyodbc
    from dotenv import load_dotenv

    load_dotenv(REPO / ".env")
    rows, _, _ = leer_rentab()
    cn = pyodbc.connect(
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={os.environ['DB_SERVER']};DATABASE={os.environ['DB_DATABASE']};"
        f"UID={os.environ['DB_UID']};PWD={os.environ['DB_PWD']};"
        "Encrypt=optional;TrustServerCertificate=yes;"
    )
    cur = cn.cursor()
    cur.execute("""
        IF OBJECT_ID('dbo.AFP_CL_BBG_Returns_Foreign','U') IS NULL
        CREATE TABLE dbo.AFP_CL_BBG_Returns_Foreign (
            Fecha      date         NOT NULL,
            Nemo       varchar(100) NOT NULL,
            TickerBBG  varchar(100) NULL,
            RetUSD_Pct float        NOT NULL,
            CargadoEn  datetime     NOT NULL DEFAULT GETDATE(),
            CONSTRAINT PK_AFP_CL_BBG_Returns_Foreign PRIMARY KEY (Fecha, Nemo)
        )
    """)
    cn.commit()
    fechas = sorted({f for f, _, _, _ in rows})
    cur.execute(
        f"DELETE FROM {TABLE} WHERE Fecha BETWEEN ? AND ?", fechas[0], fechas[-1]
    )
    print(f"DELETE rango {fechas[0]}..{fechas[-1]}: {cur.rowcount} filas previas")
    cur.fast_executemany = True
    cur.executemany(
        f"INSERT INTO {TABLE} (Fecha, Nemo, TickerBBG, RetUSD_Pct) VALUES (?,?,?,?)",
        [(f, n, t, r) for f, n, t, r in rows],
    )
    cn.commit()
    cur.execute(f"SELECT COUNT(*), MIN(Fecha), MAX(Fecha) FROM {TABLE}")
    n, f0, f1 = cur.fetchone()
    print(f"OK: {TABLE} -> {n} filas, {f0}..{f1}")
    cn.close()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if cmd == "load":
        load()
    else:
        preview()

