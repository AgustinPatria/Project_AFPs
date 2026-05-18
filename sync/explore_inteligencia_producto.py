"""
One-off exploration script: lists tables, columns and row counts in
`Inteligencia_Producto_Dev` SQL Server DB (host 18.213.175.50).

This DB is referenced by `\\moneda03\Compartidos\Inteligencia de Negocios y
Mercados\mcp_servers.json` but NOT currently synced to Supabase. We want to
know what's in it (distributor mapping? family comp extended? GICS?).

Usage:
    python sync/explore_inteligencia_producto.py
"""

import os
import urllib.parse
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

SERVER = os.getenv('DB_SERVER')
USER = 'ccampos'
PWD = 'Patria2024####'
DATABASE = 'Inteligencia_Producto_Dev'


def connect():
    odbc = f"DRIVER={{SQL Server}};SERVER={SERVER};DATABASE={DATABASE};UID={USER};PWD={PWD}"
    return create_engine(f"mssql+pyodbc:///?odbc_connect={urllib.parse.quote_plus(odbc)}")


def main():
    eng = connect()
    with eng.connect() as c:
        print('=== Schemas ===')
        for r in c.execute(text("SELECT DISTINCT TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA")):
            print(' ', r[0])

        print('\n=== Tables ===')
        rows = list(c.execute(text("""
            SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES
            ORDER BY TABLE_SCHEMA, TABLE_NAME
        """)))
        for r in rows:
            print(f'  {r[0]}.{r[1]} ({r[2]})')

        print(f'\n=== Row counts ({len(rows)} tables) ===')
        for r in rows:
            schema, name = r[0], r[1]
            try:
                n = c.execute(text(f"SELECT COUNT(*) FROM [{schema}].[{name}]")).scalar()
                print(f'  {schema}.{name}: {n:,}')
            except Exception as e:
                print(f'  {schema}.{name}: ERROR {str(e)[:60]}')


if __name__ == '__main__':
    main()
