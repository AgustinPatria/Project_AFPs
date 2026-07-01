"""READ-ONLY: inspecciona las tablas nuevas del modelo AFP en SQL Server.
Esquema + conteo + 3 filas de muestra por tabla, y distintos de Supracategory.
No escribe nada. Reusa connect_sqlserver() del sync principal.
"""
import os
import sys
import pandas as pd
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sync_sqlserver_to_supabase import connect_sqlserver  # noqa: E402

load_dotenv()
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 200)
pd.set_option('display.max_colwidth', 32)

eng = connect_sqlserver()

TARGETS = [
    'AFP_CL_09_17_25_sd_consolidated',
    'DIM_BD_Previa_AFPCL',
    'AFP_CL_CHIST_ADJUSTED',
    'AFP_CL_VC_PAT',
    'AFP_CL_BBG_Returns',
]
# bonus (dimensionales de instrumentos para inv. directa)
BONUS_PATTERNS = ['%INSTRUMENTOS%', '%Previa%', '%CHIST_ADJUSTED%',
                  '%VC_PAT%', '%BBG_Returns%', '%09_17%', '%sd_consolidated%']


def q(sql):
    return pd.read_sql(sql, eng)


print("=" * 80)
print("DESCUBRIMIENTO: tablas que matchean patrones")
print("=" * 80)
like = " OR ".join(f"TABLE_NAME LIKE '{p}'" for p in BONUS_PATTERNS)
disc = q(f"""
    SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE {like}
    ORDER BY TABLE_NAME
""")
print(disc.to_string(index=False))


def inspect(table):
    print("\n" + "=" * 80)
    print(f"TABLA: {table}")
    print("=" * 80)
    try:
        cols = q(f"""
            SELECT ORDINAL_POSITION AS pos, COLUMN_NAME AS col,
                   DATA_TYPE AS tipo, CHARACTER_MAXIMUM_LENGTH AS len,
                   IS_NULLABLE AS nulo
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '{table}'
            ORDER BY ORDINAL_POSITION
        """)
        if cols.empty:
            print("  (no encontrada en la base por defecto)")
            return
        print("\n-- columnas --")
        print(cols.to_string(index=False))

        cnt = q(f"SELECT COUNT(*) AS n FROM dbo.{table}")
        print(f"\n-- filas: {int(cnt['n'][0]):,}")

        print("\n-- muestra (TOP 3) --")
        sample = q(f"SELECT TOP 3 * FROM dbo.{table}")
        print(sample.to_string(index=False))
    except Exception as e:
        print(f"  ERROR: {e}")


for t in TARGETS:
    inspect(t)

# Supracategory distinto
print("\n" + "=" * 80)
print("DISTINCT Supracategory en AFP_CL_CHIST_ADJUSTED")
print("=" * 80)
try:
    sc = q("""
        SELECT Supracategory, COUNT(*) AS n
        FROM dbo.AFP_CL_CHIST_ADJUSTED
        GROUP BY Supracategory
        ORDER BY n DESC
    """)
    print(sc.to_string(index=False))
except Exception as e:
    print(f"  ERROR: {e}")

print("\nDONE (read-only).")
