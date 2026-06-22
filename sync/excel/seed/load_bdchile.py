"""Load bdchile.json -> dim_bdchile in Supabase.

Idempotent: DELETE all + INSERT all. Updates dim_data_sources.last_loaded_at.
"""
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

DATASET_KEY = "sec05_bdchile"
JSON_PATH = Path(__file__).resolve().parents[3] / "validacion" / "bdchile.json"


def main():
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))

    payload = []
    seen = set()
    for r in rows:
        nemo = (r.get("nemo") or "").strip()
        if not nemo or nemo in seen:
            continue
        seen.add(nemo)
        payload.append(
            {
                "nemo": nemo,
                "ticker_bbg": r.get("ticker_bbg"),
                "gics_8d": str(r["gics_8d"]) if r.get("gics_8d") is not None else None,
                "gics_2d": str(r["gics_2d"]) if r.get("gics_2d") is not None else None,
                "gics_4d": str(r["gics_4d"]) if r.get("gics_4d") is not None else None,
                "cuartil": r.get("cuartil"),
                "sector_interno": r.get("sector_interno"),
                "company_name": r.get("company_name"),
                "group_name": r.get("group_name"),
                "gics_name": r.get("gics_name"),
                "moneda_gral_id": str(r["moneda_gral_id"]) if r.get("moneda_gral_id") is not None else None,
                "pais": r.get("pais"),
                "updated_by": "load_bdchile.py",
            }
        )

    print(f"Loading {len(payload)} unique rows into dim_bdchile")
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    client.table("dim_bdchile").delete().neq("nemo", "").execute()

    BATCH = 200
    for i in range(0, len(payload), BATCH):
        chunk = payload[i:i + BATCH]
        client.table("dim_bdchile").insert(chunk).execute()
    print(f"Inserted {len(payload)} rows")

    # Update provenance metadata
    client.table("dim_data_sources").update({
        "last_loaded_at": datetime.now(timezone.utc).isoformat(),
        "last_loaded_by": "load_bdchile.py",
    }).eq("dataset_key", DATASET_KEY).execute()
    print(f"Updated dim_data_sources for {DATASET_KEY}")


if __name__ == "__main__":
    main()
