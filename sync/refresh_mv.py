"""Refresh the dashboard materialized views via the refresh_alternatives_matviews()
RPC. PostgREST can't run REFRESH MATERIALIZED VIEW directly, so the DDL lives in a
SECURITY DEFINER function exposed as an RPC (migration refresh_alternatives_matviews_rpc).

Currently refreshes: mv_chist_aa (snapshot behind v_total/v_nav/v_uncalled/v_afp_c1/c2)
and mv_aum (snapshot behind v_aum). These back the Alternatives home page; without a
refresh the dashboard would read a stale snapshot after a data load.

The sync scripts already call this RPC automatically (sync_chist_adjusted.py and
sync_sqlserver_to_supabase.py). Run this standalone only after a manual data change:

    python sync/refresh_mv.py
"""
import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()


def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)
    print("Refrescando matviews del dashboard (mv_chist_aa, mv_aum)...")
    client.rpc("refresh_alternatives_matviews").execute()
    print("OK")


if __name__ == "__main__":
    main()
