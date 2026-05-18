# AFP Chile Dashboard

Next.js + Supabase dashboard reproducing the monthly AFP Chile pension system report (10 sections, ~48 pages PDF) for the Sales/Distribution team.

## Stack

- **Frontend**: Next.js 16, React 19, Tailwind, Recharts, shadcn/ui
- **Data**: Supabase (Postgres 17) accessed via REST API
- **Sync**: Python scripts pulling from SQL Server + SP (Superintendencia de Pensiones) XML feeds

## Repo layout

```
web/    Next.js dashboard (the UI)
sync/   Python scripts that keep Supabase in sync with upstream sources
```

## Dashboard sections

| Section | Topic | Status |
|---|---|---|
| Alternative Assets | Legacy alts cubos (NAV / Uncalled / Total per AFP) | ✅ |
| Market Share (01) | AUM / Returns / Flows / Contributors per AFP × fund | ✅ |
| Asset Allocation (02·03) | Local vs Foreign × asset class × AFP × fund type | ✅ |
| Strategy (04) | Moneda strategies + peer market share | ✅ |
| Foreign Investment (07) | Foreign breakdown by region / asset class | ✅ |
| Chilean Stocks (05·06) | Portfolio + Transactions | 🚧 |
| Distributors (09) | Distributor / Manager breakdown | 🚧 |

## Running the dashboard locally

```bash
cd web
cp .env.example .env.local         # fill in Supabase URL + service role key
npm install
npm run dev                        # http://localhost:3000
```

## Running the sync

```bash
cp .env.example .env               # fill in SQL Server + Supabase creds
cd sync
pip install -r requirements.txt

# Incremental sync (detects MAX(fecha) per table)
python sync_sqlserver_to_supabase.py

# Backfill / explicit range
python sync_sqlserver_to_supabase.py --start 2020-01-01 --end 2024-12-31

# SP XML cartera_agregada (rolling 4-month window by default; use --no-prune
# when running monthly incremental to preserve historical periodos)
python sync_sp_xml.py --no-prune
```

## Architecture notes

- **Sync goes through the Supabase REST API**, not direct Postgres. Corporate firewalls often block ports 5432/6543; HTTPS/443 works.
- Per-table write strategy is deliberate (DELETE+INSERT for `historial_carteras_full` and SP XML, UPSERT for value tables, UPSERT for dimensional tables).
- Supabase views named `v_*` mirror the PDF report sections — adding a new section means adding a `v_<cubo>` view, not changing the sync.
