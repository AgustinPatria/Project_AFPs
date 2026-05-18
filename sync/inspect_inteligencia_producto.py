"""Phase 2: inspect schemas and sample rows of valuable tables."""

import os
import urllib.parse
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

server = os.getenv('DB_SERVER')
odbc = (
    f"DRIVER={{SQL Server}};SERVER={server};"
    f"DATABASE=Inteligencia_Producto_Dev;UID=ccampos;PWD=Patria2024####"
)
eng = create_engine(f"mssql+pyodbc:///?odbc_connect={urllib.parse.quote_plus(odbc)}")

INSPECT = [
    ('dimensionales', 'BD_GICS'),
    ('dimensionales', 'BD_Benchmarks'),
    ('dimensionales', 'HOMOL_Benchmarks'),
    ('dimensionales', 'BD_Funds'),
    ('dimensionales', 'HOMOL_Funds'),
    ('dimensionales', 'BD_Instrumentos'),
    ('dimensionales', 'HOMOL_Instrumentos'),
    ('dimensionales', 'BD_BalanceSheet'),
    ('extract', 'IPA'),
    ('extract', 'CAPM'),
    ('metrics', 'TBL_JPM_CEMBI_AGG_METRICS'),
    ('metrics', 'TBL_RISK_AMERICA_AGG_METRICS'),
    ('process', 'CUBO_Final'),
]


def main():
    with eng.connect() as c:
        for sch, name in INSPECT:
            print(f'\n=== {sch}.{name} ===')
            cols = list(c.execute(text(f"""
                SELECT COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA='{sch}' AND TABLE_NAME='{name}'
                ORDER BY ORDINAL_POSITION
            """)))
            print('  Cols:', ', '.join(f'{r[0]}' for r in cols))
            try:
                rows = list(c.execute(text(f"SELECT TOP 3 * FROM [{sch}].[{name}]")))
                for i, r in enumerate(rows):
                    vals = [str(v)[:35] if v is not None else 'NULL' for v in r[:min(12, len(cols))]]
                    print(f'  R{i+1}: {vals}')
            except Exception as e:
                print(f'  ERR: {str(e)[:80]}')


if __name__ == '__main__':
    main()
