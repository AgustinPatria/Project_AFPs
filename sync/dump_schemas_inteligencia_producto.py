"""Dump full schema (col name + SQL Server type + nullability) for tables to sync."""

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

TABLES = [
    ('dimensionales', 'BD_GICS'),
    ('dimensionales', 'BD_Benchmarks'),
    ('dimensionales', 'HOMOL_Benchmarks'),
    ('dimensionales', 'BD_Funds'),
    ('dimensionales', 'HOMOL_Funds'),
    ('dimensionales', 'BD_Paises'),
    ('dimensionales', 'BD_Monedas_Dimensiones'),
    ('dimensionales', 'BD_Instrumentos'),
    ('extract', 'IPA'),
    ('process', 'CUBO_Final'),
    ('metrics', 'TBL_JPM_CEMBI_AGG_METRICS'),
    ('metrics', 'TBL_RISK_AMERICA_AGG_METRICS'),
]


def main():
    with eng.connect() as c:
        for sch, name in TABLES:
            print(f'\n=== {sch}.{name} ===')
            cols = list(c.execute(text(f"""
                SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH,
                       NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE, ORDINAL_POSITION
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA='{sch}' AND TABLE_NAME='{name}'
                ORDER BY ORDINAL_POSITION
            """)))
            for col in cols:
                cname, dtype, maxlen, nprec, nscale, nullable, pos = col
                type_str = dtype
                if maxlen is not None:
                    type_str = f'{dtype}({maxlen})'
                elif nprec is not None:
                    type_str = f'{dtype}({nprec},{nscale})'
                print(f'  {pos:2d}. {cname:35s} {type_str:25s} {"NULL" if nullable=="YES" else "NOT NULL"}')


if __name__ == '__main__':
    main()
