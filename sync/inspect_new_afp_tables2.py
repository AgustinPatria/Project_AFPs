"""READ-ONLY round 2: distintos de columnas clasificadoras, rango de fechas/desfase,
y descubrimiento de las dimensionales de instrumentos (cross-db)."""
import os
import sys
import pandas as pd
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sync_sqlserver_to_supabase import connect_sqlserver  # noqa: E402

load_dotenv()
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 220)
pd.set_option('display.max_colwidth', 40)

eng = connect_sqlserver()


def q(sql):
    return pd.read_sql(sql, eng)


def show(title, sql):
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)
    try:
        print(q(sql).to_string(index=False))
    except Exception as e:
        print(f"  ERROR: {e}")


show("DIM_BD_Previa_AFPCL · distinct Type",
    "SELECT Type, COUNT(*) n FROM dbo.DIM_BD_Previa_AFPCL GROUP BY Type ORDER BY n DESC")

show("AFP_CL_CHIST_ADJUSTED · distinct Type",
    "SELECT Type, COUNT(*) n FROM dbo.AFP_CL_CHIST_ADJUSTED GROUP BY Type ORDER BY n DESC")

show("AFP_CL_CHIST_ADJUSTED · Supracategory x Type (cruce)",
    """SELECT Supracategory, Type, COUNT(*) n FROM dbo.AFP_CL_CHIST_ADJUSTED
       GROUP BY Supracategory, Type ORDER BY Supracategory, n DESC""")

show("AFP_CL_09_17_25_sd_consolidated · distinct Source",
    "SELECT Source, COUNT(*) n FROM dbo.AFP_CL_09_17_25_sd_consolidated GROUP BY Source ORDER BY n DESC")

show("Rangos de fecha (desfase) y recencia",
    """SELECT 'CHIST_ADJUSTED' tabla, MIN(fecha) min_fecha, MAX(fecha) max_fecha,
              MIN(FechaReporte) min_rep, MAX(FechaReporte) max_rep,
              COUNT(DISTINCT fecha) n_fechas FROM dbo.AFP_CL_CHIST_ADJUSTED
       UNION ALL
       SELECT 'consolidated_sd', MIN(fecha), MAX(fecha), NULL, NULL, COUNT(DISTINCT fecha) FROM dbo.AFP_CL_09_17_25_sd_consolidated
       UNION ALL
       SELECT 'VC_PAT', MIN(Fecha), MAX(Fecha), NULL, NULL, COUNT(DISTINCT Fecha) FROM dbo.AFP_CL_VC_PAT
       UNION ALL
       SELECT 'BBG_Returns', MIN(StartDate), MAX(EndDate), NULL, NULL, COUNT(DISTINCT EndDate) FROM dbo.AFP_CL_BBG_Returns""")

show("CHIST_ADJUSTED · ejemplos donde FechaReporte != fecha (desfase real)",
    """SELECT TOP 5 FechaReporte, fecha, afp, Supracategory, COUNT(*) n
       FROM dbo.AFP_CL_CHIST_ADJUSTED
       WHERE FechaReporte <> fecha
       GROUP BY FechaReporte, fecha, afp, Supracategory ORDER BY FechaReporte DESC""")

# Dimensionales de instrumentos: buscar en Inteligencia_Producto_Dev y alrededores
show("Cross-DB: tablas tipo INSTRUMENTOS / HOMOL en Inteligencia_Producto_Dev",
    """SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME
       FROM Inteligencia_Producto_Dev.INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME LIKE '%Instrumento%' OR TABLE_NAME LIKE '%HOMOL%' OR TABLE_NAME LIKE '%GICS%'
       ORDER BY TABLE_NAME""")

show("Mercado: tablas DIM/HOMOL/BD que mencionan FUNDS o INSTRUMENT",
    """SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME LIKE '%FUNDS%' OR TABLE_NAME LIKE '%HOMOL%' OR TABLE_NAME LIKE '%Instrument%'
       ORDER BY TABLE_NAME""")

print("\nDONE (read-only).")
