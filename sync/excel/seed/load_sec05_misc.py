"""Load IPSA + Mkt_Cap + Pionero + MRV JSONs into Supabase.

Idempotent: DELETE all + INSERT all per table. Updates dim_data_sources.
"""
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

VALID_DIR = Path(__file__).resolve().parents[3] / "validacion"
NOW = datetime.now(timezone.utc).isoformat()


def main():
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # IPSA
    rows = json.loads((VALID_DIR / "ipsa.json").read_text(encoding="utf-8"))
    payload = [{**r, "updated_by": "load_sec05_misc.py"} for r in rows]
    client.table("dim_ipsa_composition").delete().neq("ticker_bbg", "").execute()
    for i in range(0, len(payload), 200):
        client.table("dim_ipsa_composition").insert(payload[i:i + 200]).execute()
    print(f"IPSA: inserted {len(payload)}")
    client.table("dim_data_sources").update({"last_loaded_at": NOW, "last_loaded_by": "load_sec05_misc.py"}).eq("dataset_key", "sec05_ipsa_composition").execute()

    # Mkt_Cap
    rows = json.loads((VALID_DIR / "mkt_cap.json").read_text(encoding="utf-8"))
    payload = [{**r, "updated_by": "load_sec05_misc.py"} for r in rows]
    client.table("dim_mkt_cap_chilean").delete().neq("ticker_bbg", "").execute()
    for i in range(0, len(payload), 200):
        client.table("dim_mkt_cap_chilean").insert(payload[i:i + 200]).execute()
    print(f"Mkt_Cap: inserted {len(payload)}")
    client.table("dim_data_sources").update({"last_loaded_at": NOW, "last_loaded_by": "load_sec05_misc.py"}).eq("dataset_key", "sec05_mkt_cap_adrs").execute()

    # Benchmarks (Pionero + MRV)
    rows = json.loads((VALID_DIR / "benchmark_composition.json").read_text(encoding="utf-8"))
    payload = [{**r, "updated_by": "load_sec05_misc.py"} for r in rows]
    client.table("dim_benchmark_composition").delete().neq("nemo", "").execute()
    for i in range(0, len(payload), 200):
        client.table("dim_benchmark_composition").insert(payload[i:i + 200]).execute()
    print(f"Benchmarks: inserted {len(payload)}")
    client.table("dim_data_sources").update({"last_loaded_at": NOW, "last_loaded_by": "load_sec05_misc.py"}).eq("dataset_key", "sec05_pionero_benchmark").execute()
    client.table("dim_data_sources").update({"last_loaded_at": NOW, "last_loaded_by": "load_sec05_misc.py"}).eq("dataset_key", "sec05_mrv_benchmark").execute()

    print("OK")


if __name__ == "__main__":
    main()
