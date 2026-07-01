-- Foreign migration follow-ups (2026-06-26), after the Step-1 summary/managers switch.
-- Migrations: fase2_distributors_swap_to_consolidated, fase2_drop_orphan_sp_views.

-- ── Distributors (Sec09): primary source SP -> consolidated_sd ───────────────
-- v_sp_foreign_classified -> v_consolidated_foreign_classified. Drops the
-- chist_fallback branch (consolidated_sd covers full history 2012+, and the
-- fallback carried a latent CLP/USD bug: inversion/1e6 with no FX). Reconciled
-- vs SP 2026-04: per-distributor diff <=140 USD MM (+0.17%, consolidated fuller).
CREATE OR REPLACE VIEW v_distributors_sec09 AS
WITH base AS (
  SELECT s.fecha_reporte, s.isin, s.fund_id, s.fondo AS fondo_bd, s.manager AS manager_bd,
         s.monto_dolares AS monto_usd_mm
  FROM v_consolidated_foreign_classified s
  WHERE s.monto_dolares > 0::numeric AND s.isin IS NOT NULL
),
resolved AS (
  SELECT b.fecha_reporte, b.isin,
    COALESCE(o.family, 'Unmapped'::text) AS distributor,
    COALESCE(o.manager, b.manager_bd::text, '(no manager)'::text) AS manager,
    o.family IS NOT NULL AS is_mapped,
    b.monto_usd_mm
  FROM base b
  LEFT JOIN dim_foreign_classification_overlay o ON o.identificador = b.isin
)
SELECT fecha_reporte, distributor, manager,
       bool_or(is_mapped) AS is_mapped, sum(monto_usd_mm) AS monto_usd_mm
FROM resolved GROUP BY fecha_reporte, distributor, manager;

-- ── Drop verified-orphan SP views (leaf in dep graph + not read by the front) ─
-- These pinned sp_* for nothing. NOT dropped (still genuine consumers):
--   v_sp_chilean_stocks_by_issuer, v_sp_fi_local, v_sp_local_equity_di_vs_if  -> Strategy local-equity (item #4)
--   v_sp_foreign_classified / v_sp_foreign_pdf / v_sp_emisor_extranjero       -> flows (Step 2) + DI (Step 3)
--   v_sp_direct_investment_detail + mv_sp_direct_investment_*                  -> DI (Step 3)
-- After these drops, sp_valor_afp has ZERO dependents (drop in Step 4 with the sync update).
DROP VIEW IF EXISTS v_chilean_stocks_by_issuer_combined;   -- front uses v_chilean_stocks_gics
DROP VIEW IF EXISTS v_foreign_by_fund_combined;
DROP VIEW IF EXISTS v_sp_foreign_by_fund;
DROP MATERIALIZED VIEW IF EXISTS mv_sp_foreign_pdf_summary; -- orphaned by Step 1
DROP VIEW IF EXISTS v_sp_foreign_pdf_summary;
DROP VIEW IF EXISTS v_sp_foreign_managers;
DROP VIEW IF EXISTS v_sp_asset_class_afp;
DROP VIEW IF EXISTS v_sp_asset_class_dates;
DROP VIEW IF EXISTS v_sp_asset_class_tipo;
DROP VIEW IF EXISTS v_sp_aum_afp;
DROP VIEW IF EXISTS v_sp_cartera_afp;
DROP VIEW IF EXISTS v_sp_cartera_fondo;
DROP VIEW IF EXISTS v_sp_emisor_nacional;
DROP VIEW IF EXISTS v_sp_extranjero_grupo;
DROP VIEW IF EXISTS v_local_fi_by_afp;
