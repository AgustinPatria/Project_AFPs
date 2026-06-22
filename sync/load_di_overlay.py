"""Load di_overlay.json into Supabase table dim_direct_investment_overlay.
Idempotent (truncate + insert)."""
import json, os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

JSON_PATH = Path(__file__).resolve().parents[1] / "validacion" / "di_overlay.json"


def main():
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    print(f"Loading {len(rows)} rows into dim_direct_investment_overlay")

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # Truncate by deleting all rows (PostgREST has no TRUNCATE)
    client.table("dim_direct_investment_overlay").delete().neq("identificador", "").execute()

    # Insert in batches
    BATCH = 200
    inserted = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        client.table("dim_direct_investment_overlay").insert(chunk).execute()
        inserted += len(chunk)
    print(f"Inserted {inserted} rows")


if __name__ == "__main__":
    main()
