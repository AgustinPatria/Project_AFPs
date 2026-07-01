-- Ajustes_Dashboard 1.4 (temporal-vintage badge) — registra la fuente CHIST del
-- card "Positioning by AFP" del módulo Strategy en v_module_freshness, para que
-- <AsOfBadge module="strategy" source="Posicionamiento AFP (CHIST)"/> muestre su
-- propia fecha (CHIST, ~5m rezago) y no se confunda con el header fresco (SP).
-- Migration: freshness_add_strategy_afp_owuw. CREATE OR REPLACE (no hay tabla).
CREATE OR REPLACE VIEW public.v_module_freshness AS
WITH src AS (
  SELECT 'foreign'::text AS module_key, 'Holdings (CHIST)'::text AS source_label,
         (SELECT max(fecha_reporte) FROM chist_adjusted) AS as_of_date,
         NULL::date AS published_date, 'deliberate'::text AS lag_kind, 150 AS expected_lag_days, true AS is_primary
  UNION ALL SELECT 'foreign', 'Cartera agregada (SP)', (SELECT max(fecha) FROM consolidated_sd), NULL::date, 'sp_agg', 70, false
  UNION ALL SELECT 'foreign', 'Retornos (Bloomberg)', (SELECT max(end_date) FROM bbg_returns), NULL::date, 'bbg', 90, false
  UNION ALL SELECT 'alternatives', 'Holdings (CHIST)', (SELECT max(fecha_reporte) FROM chist_adjusted), NULL::date, 'deliberate', 150, true
  UNION ALL SELECT 'market_share', 'Patrimonio/Cuota', (SELECT max(fecha) FROM valores_cuota_patrimonio), NULL::date, 'fast', 30, true
  UNION ALL SELECT 'market_share', 'Cotizantes', (SELECT max(fecha) FROM cotizantes_afp), NULL::date, 'sp_agg', 75, false
  UNION ALL SELECT 'asset_allocation', 'Cartera agregada (SP, _sd)', (SELECT max(fecha) FROM sd_asset_class_tipo), NULL::date, 'sp_agg', 70, true
  UNION ALL SELECT 'strategy', 'Estrategias (SP)', (SELECT max(fecha) FROM consolidated_sd), NULL::date, 'sp_agg', 70, true
  UNION ALL SELECT 'strategy', 'Local Equity DI (CHIST)', (SELECT max(fecha_reporte) FROM chist_adjusted), NULL::date, 'deliberate', 150, false
  UNION ALL SELECT 'strategy', 'Posicionamiento AFP (CHIST)', (SELECT max(fecha_reporte) FROM chist_adjusted), NULL::date, 'deliberate', 150, false
  UNION ALL SELECT 'chilean_stocks', 'Holdings (CHIST)', (SELECT max(fecha_reporte) FROM chist_adjusted), NULL::date, 'deliberate', 150, true
  UNION ALL SELECT 'chilean_stocks', 'Pionero/MRV (IPD)', (SELECT max(fecha_reporte) FROM ipd_positions), NULL::date, 'ipd', 60, false
  UNION ALL SELECT 'distributors', 'Holdings (CHIST)', (SELECT max(fecha_reporte) FROM chist_adjusted), NULL::date, 'deliberate', 150, true
  UNION ALL SELECT 'managers', 'Holdings (CHIST)', (SELECT max(fecha_reporte) FROM chist_adjusted), NULL::date, 'deliberate', 150, true
)
SELECT module_key, source_label, as_of_date, published_date, lag_kind, expected_lag_days, is_primary,
       as_of_date < (CURRENT_DATE - expected_lag_days::double precision * '1 day'::interval)::date AS is_behind
FROM src;
