"""Sanity READ-ONLY: ubicacion exacta de AFP_CL_BBG_Returns_Foreign."""
import os

import pyodbc
from dotenv import load_dotenv

load_dotenv()

cn = pyodbc.connect(
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={os.environ['DB_SERVER']};DATABASE={os.environ['DB_DATABASE']};"
    f"UID={os.environ['DB_UID']};PWD={os.environ['DB_PWD']};"
    "Encrypt=optional;TrustServerCertificate=yes;"
)
cur = cn.cursor()
cur.execute("SELECT @@SERVERNAME AS srv, DB_NAME() AS db, SUSER_SNAME() AS usr")
r = cur.fetchone()
print(f"Conectado a: servidor={r.srv}  base={r.db}  usuario={r.usr}")

cur.execute("""
    SELECT s.name AS esquema, t.name AS tabla, t.create_date, p.rows
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
    WHERE t.name = 'AFP_CL_BBG_Returns_Foreign'
""")
rows = cur.fetchall()
if not rows:
    print("La tabla NO existe en esta base.")
else:
    for r in rows:
        print(f"Existe: {r.esquema}.{r.tabla}  creada={r.create_date}  filas={r.rows}")

cur.execute("SELECT COUNT(*) FROM Inteligencia_Mercado.dbo.AFP_CL_BBG_Returns_Foreign")
print("COUNT via nombre full-qualified:", cur.fetchone()[0])
cn.close()
