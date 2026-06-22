"""Carga la nueva taxonomia de BD_Funds.xlsx en dim_bd_funds (columnas nt_*).

BD_Funds.xlsx solo identifica fondos por nombre + manager; dim_bd_funds usa
`id`. Este script une por nombre normalizado (con manager como desempate),
backfillea el `id`, y hace UPSERT de las 5 columnas nt_* via la REST API de
Supabase (la red de Patria bloquea Postgres directo).

Patron mantenido-a-mano: NO forma parte del sync incremental.

Uso:
    python sync/load_bd_funds_nt.py                 # dry-run: reporte de reconciliacion, no escribe
    python sync/load_bd_funds_nt.py --apply         # escribe las columnas nt_* en Supabase
    python sync/load_bd_funds_nt.py --xlsx ruta.xlsx
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from collections import defaultdict

import openpyxl
from dotenv import load_dotenv
from supabase import create_client

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_XLSX = os.path.join(REPO_ROOT, "BD_Funds.xlsx")

# Columnas Excel -> columna destino en dim_bd_funds
COLMAP = {
    2: "nt_asset_class",      # Asset Class
    3: "nt_sub_asset_class",  # Sub Asset Class
    4: "nt_category",         # Category
    5: "nt_sub_category",     # Sub-Category
    6: "nt_region",           # Region
}


def norm(s: object) -> str:
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


# Aliases manuales: nombre normalizado Excel -> nombre normalizado DB, cuando el
# fondo existe en dim_bd_funds con un nombre ligeramente distinto (p.ej. sufijo).
NAME_ALIASES = {
    norm("Lord Abbett High Yield Fund"): norm("Lord Abbett High Yield Fund (IE)"),
}


def load_excel(path: str) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    out = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or row[0] is None:
            continue
        out.append(
            {
                "fund": row[0],
                "manager": row[1],
                "nname": norm(row[0]),
                "nmgr": norm(row[1]),
                "vals": {dst: row[src] for src, dst in COLMAP.items()},
            }
        )
    return out


def fetch_db(sb) -> list[dict]:
    rows, start = [], 0
    while True:
        chunk = (
            sb.table("dim_bd_funds")
            .select("id,fondo,manager")
            .range(start, start + 999)
            .execute()
            .data
        )
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        start += 1000
    return rows


def reconcile(xl: list[dict], db: list[dict]):
    by_name = defaultdict(list)
    for r in db:
        by_name[norm(r["fondo"])].append(r)

    updates: dict[str, dict] = {}      # id -> vals
    multi, unmatched = [], []          # multi = mismo fondo con varios ids (se aplica a todos)
    matched_ids = set()

    for x in xl:
        key = NAME_ALIASES.get(x["nname"], x["nname"])
        cands = by_name.get(key, [])
        if not cands:
            unmatched.append(x)
            continue
        # Desempate por manager si reduce a >=1; si no, se conserva la lista completa.
        mgr_hits = [c for c in cands if norm(c["manager"]) == x["nmgr"]]
        targets = mgr_hits if mgr_hits else cands
        if len(targets) > 1:
            multi.append((x, targets))
        for c in targets:
            updates[c["id"]] = {"id": c["id"], **x["vals"]}
            matched_ids.add(c["id"])

    db_only = [r for r in db if r["id"] not in matched_ids]
    return updates, multi, unmatched, db_only


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default=DEFAULT_XLSX)
    ap.add_argument("--apply", action="store_true", help="escribe en Supabase (sin esto, dry-run)")
    args = ap.parse_args()

    load_dotenv(os.path.join(REPO_ROOT, ".env"))
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    xl = load_excel(args.xlsx)
    db = fetch_db(sb)
    updates, multi, unmatched, db_only = reconcile(xl, db)

    print(f"Excel filas (no vacias)       : {len(xl)}")
    print(f"DB dim_bd_funds               : {len(db)}")
    print(f"Filas (id) a actualizar       : {len(updates)}")
    print(f"Fondos con >1 id (a todos)    : {len(multi)}")
    print(f"Sin match en DB               : {len(unmatched)}")
    print(f"En DB y NO en Excel (->NULL)  : {len(db_only)}")

    if multi:
        print("\n--- FONDOS CON VARIOS Ids (misma clasificacion a todos) ---")
        seen = set()
        for x, cands in multi:
            if x["nname"] in seen:
                continue
            seen.add(x["nname"])
            print(f"  {x['fund']!r} ({x['manager']}) -> ids {[c['id'] for c in cands]}")
    if unmatched:
        print("\n--- EXCEL SIN MATCH EN DB ---")
        for x in unmatched:
            print(f"  {x['fund']!r} ({x['manager']})")
    if db_only:
        print(f"\n--- DB SIN ENTRADA EN EXCEL (quedan nt_* en NULL) [{len(db_only)}] ---")
        for r in db_only[:30]:
            print(f"  id={r['id']} {r['fondo']!r} ({r['manager']})")

    if not args.apply:
        print("\n[dry-run] No se escribio nada. Re-corre con --apply para cargar.")
        return 0

    rows = list(updates.values())
    print(f"\n[apply] UPSERT de {len(rows)} filas (solo columnas nt_*)...")
    B = 500
    for i in range(0, len(rows), B):
        sb.table("dim_bd_funds").upsert(rows[i : i + B], on_conflict="id").execute()
        print(f"  {min(i + B, len(rows))}/{len(rows)}")
    print("[apply] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
