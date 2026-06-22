# Excel Seed Scripts

Transitional bootstrap loaders for datasets that today live only in the legacy
`Excels construccion pdf/*.xlsm` files. Each dataset has:

- `extract_<key>.py` — reads the Excel, writes a JSON snapshot to `validacion/`
- `load_<key>.py` — reads the JSON, upserts to Supabase, updates
  `dim_data_sources.last_loaded_at`

These scripts run **once** during the migration sprint. After that:

- Datasets with `target_source = 'AUTO'` will be replaced by sync scripts
  (Bloomberg, network share, etc.).
- Datasets with `target_source = 'MANUAL'` will be edited via dashboard admin
  UIs; the seed remains the initial population.

When the legacy Excels are retired, this whole folder becomes archive and can
be deleted. Until then, keep both extract + load scripts checked in so the
seed is reproducible.

## Dataset → script mapping

| `dataset_key` | extract | load | target |
|---|---|---|---|
| `sec05_bdchile` | `extract_bdchile.py` | `load_bdchile.py` | MANUAL |
| `sec05_ipsa_composition` | `extract_ipsa.py` | `load_ipsa.py` | AUTO (Bloomberg) |
| `sec05_mkt_cap_adrs` | `extract_mkt_cap.py` | `load_mkt_cap.py` | AUTO (Bloomberg) |
| `sec05_pionero_benchmark` | `extract_pionero.py` | `load_pionero.py` | AUTO (network share) |
| `sec05_mrv_benchmark` | `extract_mrv.py` | `load_mrv.py` | AUTO (network share) |
| `sec06_08_transactions` | `extract_transactions.py` | `load_transactions.py` | AUTO (network share) |
| `sec09_isin_classification` | `sync/export_foreign_overlay.py` (existing) | `sync/load_foreign_overlay.py` (existing) | MANUAL |
