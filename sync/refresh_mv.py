"""One-off REFRESH MATERIALIZED VIEW. Uses Supabase REST RPC fallback via
psycopg-style call — but since we can't easily run DDL over REST, we POST
directly to the supabase-py service and rely on a longer timeout.
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()


def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    # Use the Supabase pg-meta query endpoint
    endpoint = f"{url}/rest/v1/rpc/exec_sql"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    # If exec_sql RPC isn't defined, this returns 404 — fall back gracefully.
    r = requests.post(
        endpoint,
        headers=headers,
        json={"sql": "REFRESH MATERIALIZED VIEW public.mv_foreign_pdf_summary;"},
        timeout=300,
    )
    print(r.status_code, r.text[:300])


if __name__ == "__main__":
    main()
