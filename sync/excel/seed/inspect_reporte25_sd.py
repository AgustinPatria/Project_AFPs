"""Diagnostico READ-ONLY de TBL_SPE_REPORTE25_SD en SQL Server.
Compara estructura/cobertura/totales contra el extracto del Excel 04_tabla_sin_desfase_25.
"""
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

    print("=== tablas que matchean %REPORTE25% / %25_SD% ===")
    cur.execute("""
        SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME LIKE '%REPORTE25%' OR TABLE_NAME LIKE '%25_SD%' OR TABLE_NAME LIKE '%25SD%'
    """)
    for r in cur.fetchall():
        print("  ", r.TABLE_SCHEMA, ".", r.TABLE_NAME)

    print("\n=== columnas de TBL_SPE_REPORTE25_SD ===")
    cur.execute("""
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'TBL_SPE_REPORTE25_SD' ORDER BY ORDINAL_POSITION
    """)
    cols = cur.fetchall()
    for r in cols:
        print(f"   {r.COLUMN_NAME:<30} {r.DATA_TYPE}({r.CHARACTER_MAXIMUM_LENGTH})")

    print("\n=== top 5 filas ===")
    cur.execute("SELECT TOP 5 * FROM dbo.TBL_SPE_REPORTE25_SD")
    names = [d[0] for d in cur.description]
    print("  cols:", names)
    for r in cur.fetchall():
        print("  ", [str(v)[:30] for v in r])

    print("\n=== cobertura ===")
    cur.execute("SELECT COUNT(*) AS n FROM dbo.TBL_SPE_REPORTE25_SD")
    print("   filas totales:", cur.fetchone().n)

    cn.close()


if __name__ == "__main__":
    main()
