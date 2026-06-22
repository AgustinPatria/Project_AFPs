"""Diagnostico READ-ONLY parte 2: cobertura y totales de TBL_SPE_REPORTE25_SD."""
import os

import pyodbc
from dotenv import load_dotenv

load_dotenv()

CONN = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={os.environ['DB_SERVER']};DATABASE={os.environ['DB_DATABASE']};"
    f"UID={os.environ['DB_UID']};PWD={os.environ['DB_PWD']};"
    "Encrypt=optional;TrustServerCertificate=yes;"
)


def main():
    cn = pyodbc.connect(CONN)
    cur = cn.cursor()

    print("=== cobertura temporal ===")
    cur.execute("""
        SELECT MIN(Fecha) AS f0, MAX(Fecha) AS f1, COUNT(DISTINCT Fecha) AS meses
        FROM dbo.TBL_SPE_REPORTE25_SD
    """)
    r = cur.fetchone()
    print(f"   {r.f0} .. {r.f1}  ({r.meses} fechas)")

    print("\n=== valores de Multifondo ===")
    cur.execute("""
        SELECT Multifondo, COUNT(*) AS n FROM dbo.TBL_SPE_REPORTE25_SD
        GROUP BY Multifondo ORDER BY Multifondo
    """)
    for r in cur.fetchall():
        print(f"   {r.Multifondo:<10} {r.n:>8}")

    print("\n=== secciones distintas ===")
    cur.execute("""
        SELECT Seccion, COUNT(*) AS n FROM dbo.TBL_SPE_REPORTE25_SD
        GROUP BY Seccion ORDER BY n DESC
    """)
    for r in cur.fetchall():
        print(f"   {str(r.Seccion):<60} {r.n:>8}")

    print("\n=== total USD mm por mes (suma multifondos A-E), meses clave vs Excel ===")
    print("   (Excel TOTAL col: 202412=89,244 | 202211=74,020 | 201806=88,191 | 201509=65,550 | 200909=42,915)")
    cur.execute("""
        SELECT Fecha, SUM(MontoUSDMM) AS usd, COUNT(*) AS filas,
               COUNT(DISTINCT Nemotecnico) AS nemos
        FROM dbo.TBL_SPE_REPORTE25_SD
        WHERE Fecha IN ('2024-12-31','2022-11-30','2018-06-30','2015-09-30','2009-09-30')
        GROUP BY Fecha ORDER BY Fecha
    """)
    for r in cur.fetchall():
        print(f"   {r.Fecha}  {r.usd:>12,.0f}  {r.filas:>6} filas  {r.nemos:>5} nemos")

    print("\n=== fechas por anio (huecos?) ===")
    cur.execute("""
        SELECT YEAR(Fecha) AS anio, COUNT(DISTINCT Fecha) AS meses
        FROM dbo.TBL_SPE_REPORTE25_SD GROUP BY YEAR(Fecha) ORDER BY anio
    """)
    for r in cur.fetchall():
        print(f"   {r.anio}: {r.meses} meses")

    cn.close()


if __name__ == "__main__":
    main()
