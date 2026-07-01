-- Step 4: freshness repoint + reclaim. Migrations: fase4_freshness_repoint_off_sp,
-- fase4_drop_sp_and_legacy_tables.
--
-- (a) v_module_freshness repointed off the tables being dropped:
--       foreign 'Cartera agregada (SP)'  sp_fila            -> consolidated_sd
--       foreign 'Retornos (Bloomberg)'   bbg_returns_foreign-> bbg_returns
--       alternatives 'Holdings (CHIST)'  historial_carteras -> chist_adjusted
--       strategy 'Estrategias (SP)'      sp_fila            -> consolidated_sd
--     published_date -> NULL on the consolidated rows (no publication date). Labels kept
--     (honest relabel deferred to the UI pass). See migration fase4_freshness_repoint_off_sp
--     for the full CREATE OR REPLACE.
--
-- (b) DROP the now-unreferenced legacy/mirror tables (zero DB dependents; recoverable from
--     SQL Server AFP_CL_SP_* / chist_adjusted / bbg_returns). DB 221 -> 155 MB.

DROP TABLE IF EXISTS sp_valor_fondo;
DROP TABLE IF EXISTS sp_valor_afp;
DROP TABLE IF EXISTS sp_valor_instrumento;
DROP TABLE IF EXISTS sp_fila;
DROP TABLE IF EXISTS bbg_returns_foreign;
DROP TABLE IF EXISTS historial_carteras;

-- Sync scripts updated accordingly:
--   sync_sp_sqlserver_to_supabase.py     -> SYNC_SP_TABLES=False (cotizantes_afp sigue; sp_* off)
--   sync_sqlserver_to_supabase.py        -> sync_historial_carteras() ya no se invoca; fuera de print_summary
--   sync_bbg_returns_to_supabase.py      -> deprecado (auto-bloqueo; usar sync_bbg_returns.py)
