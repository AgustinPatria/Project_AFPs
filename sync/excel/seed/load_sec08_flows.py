"""Load sec08_flows.json into dim_sec08_top_flows."""
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

JSON_PATH = Path(__file__).resolve().parents[3] / "validacion" / "sec08_flows.json"


def main():
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    payload = [{**r, "updated_by": "load_sec08_flows.py"} for r in rows]
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    client.table("dim_sec08_top_flows").delete().neq("fondo", "").execute()
    for i in range(0, len(payload), 200):
        client.table("dim_sec08_top_flows").insert(payload[i:i + 200]).execute()
    print(f"Inserted {len(payload)} rows")
    client.table("dim_data_sources").update({
        "last_loaded_at": datetime.now(timezone.utc).isoformat(),
        "last_loaded_by": "load_sec08_flows.py",
        "excel_seed_periodo": "Mar-2026",
    }).eq("dataset_key", "sec06_08_transactions").execute()


if __name__ == "__main__":
    main()
