"""Load foreign_overlay.json into dim_foreign_classification_overlay."""
import json, os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

JSON_PATH = Path(__file__).resolve().parents[1] / "validacion" / "foreign_overlay.json"


def main():
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    # Strip to the columns the table holds; drop rows without an identificador.
    # 2026-06-04: persist also family/manager/fondo/fund_type/fund_style/alt_id
    # so the overlay is the full ISIN-level classification source — matches the
    # legacy Output_25sd 1:1. Replaces the manual edit loop in the legacy Excel.
    payload = []
    seen = set()
    for r in rows:
        ident = (r.get("identificador") or "").strip()
        if not ident or ident in seen:
            continue
        seen.add(ident)
        payload.append(
            {
                "identificador": ident,
                "asset_class": r.get("asset_class"),
                "region": r.get("region"),
                "country": r.get("country"),
                "category": r.get("category"),
                "currency": r.get("currency"),
                "family": r.get("family"),
                "manager": r.get("manager"),
                "fondo": r.get("fondo"),
                "fund_type": r.get("fund_type"),
                "fund_style": r.get("fund_style"),
                "alt_id": r.get("alt_id"),
            }
        )

    print(f"Loading {len(payload)} unique rows into dim_foreign_classification_overlay")

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # Idempotent reload
    client.table("dim_foreign_classification_overlay").delete().neq("identificador", "").execute()

    BATCH = 200
    for i in range(0, len(payload), BATCH):
        chunk = payload[i:i + BATCH]
        client.table("dim_foreign_classification_overlay").insert(chunk).execute()
    print(f"Inserted {len(payload)} rows")


if __name__ == "__main__":
    main()
