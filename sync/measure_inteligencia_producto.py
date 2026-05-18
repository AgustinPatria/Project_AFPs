"""Measure volume: how many rows per candidate table, fecha ranges, filtered subsets."""

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

QUERIES = [
    ('BD_GICS (full)', 'SELECT COUNT(*) FROM dimensionales.BD_GICS'),
    ('BD_Benchmarks (full)', 'SELECT COUNT(*) FROM dimensionales.BD_Benchmarks'),
    ('HOMOL_Benchmarks (full)', 'SELECT COUNT(*) FROM dimensionales.HOMOL_Benchmarks'),
    ('BD_Funds (full)', 'SELECT COUNT(*) FROM dimensionales.BD_Funds'),
    ('HOMOL_Funds (full)', 'SELECT COUNT(*) FROM dimensionales.HOMOL_Funds'),
    ('BD_Paises (full)', 'SELECT COUNT(*) FROM dimensionales.BD_Paises'),
    ('BD_Monedas (full)', 'SELECT COUNT(*) FROM dimensionales.BD_Monedas_Dimensiones'),
    ('BD_Instrumentos total', 'SELECT COUNT(*) FROM dimensionales.BD_Instrumentos'),
    ('BD_Instrumentos con GICS', "SELECT COUNT(*) FROM dimensionales.BD_Instrumentos WHERE Sector_GICS IS NOT NULL AND Sector_GICS <> '0' AND Sector_GICS <> ''"),
    ('BD_Instrumentos Chile', "SELECT COUNT(*) FROM dimensionales.BD_Instrumentos WHERE Issue_Country = 'CL' OR Issue_Country = 'CHL' OR Issue_Country = 'CHILE'"),
    ('BD_Instrumentos con TickerBBG', 'SELECT COUNT(*) FROM dimensionales.BD_Instrumentos WHERE TickerBBG IS NOT NULL'),
    ('HOMOL_Instrumentos total', 'SELECT COUNT(*) FROM dimensionales.HOMOL_Instrumentos'),
    ('IPA rows', 'SELECT COUNT(*) FROM extract.IPA'),
    ('IPA fechas distintas', 'SELECT COUNT(DISTINCT FechaCartera) FROM extract.IPA'),
    ('IPA fecha range', 'SELECT MIN(FechaCartera), MAX(FechaCartera) FROM extract.IPA'),
    ('IPA last fecha rows', 'SELECT COUNT(*) FROM extract.IPA WHERE FechaCartera = (SELECT MAX(FechaCartera) FROM extract.IPA)'),
    ('CUBO_Final rows', 'SELECT COUNT(*) FROM process.CUBO_Final'),
    ('CUBO_Final fechas', 'SELECT COUNT(DISTINCT FechaCartera) FROM process.CUBO_Final'),
    ('CUBO_Final range', 'SELECT MIN(FechaCartera), MAX(FechaCartera) FROM process.CUBO_Final'),
    ('JPM CEMBI agg metrics fechas', 'SELECT COUNT(DISTINCT FechaCartera) FROM metrics.TBL_JPM_CEMBI_AGG_METRICS'),
    ('RISK America agg metrics fechas', 'SELECT COUNT(DISTINCT Fecha) FROM metrics.TBL_RISK_AMERICA_AGG_METRICS'),
]


def main():
    with eng.connect() as c:
        for name, q in QUERIES:
            try:
                r = c.execute(text(q)).fetchone()
                print(f'  {name:45s}: {r}')
            except Exception as e:
                print(f'  {name:45s}: ERROR {str(e)[:80]}')


if __name__ == '__main__':
    main()
