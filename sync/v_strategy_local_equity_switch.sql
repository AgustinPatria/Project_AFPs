-- Strategy local-equity (Local Equity: Direct Investment vs Investment Funds, CLP bn) — SP -> consolidated_sd.
-- Migration: fase2_strategy_local_equity_to_consolidated.
--
-- Per the fresh-portfolio model: consolidated_sd Source 09 = national DIRECT_INV (all equity; there is
-- NO national direct FI), Source 17 = national FUNDs (verified via DIM_BD_Previa: 09=100% DIRECT_INV,
-- 17=100% FUND). direct_clp_bn = sum(Source 09) * USDCLP_monthend / 1000; funds_clp_bn = sum(Source 17
-- funds where dim_bd_funds asset_class=Equity & region=Chile) * FX / 1000 (nt_ variant likewise).
--
-- Reconciled vs the SP branch it replaces (v_sp_local_equity_di_vs_if, 2026-02..05): direct +0.06..0.22%
-- (consolidated marginally fuller), funds EXACT. (vs the CHIST native-CLP branch it is +1.8% — an
-- FX-method seam that already existed between the combined's CHIST history and SP fresh tail.)
--
-- v_local_equity_di_vs_if_combined unchanged: CHIST history (<=2026-01) + this view for the fresh tail.
-- Name v_sp_local_equity_di_vs_if kept (now a misnomer; reads consolidated). After the rewrite,
-- v_sp_chilean_stocks_by_issuer and v_sp_fi_local were orphan and dropped, which freed sp_valor_fondo,
-- sp_valor_instrumento and sp_valor_afp entirely. sp_* is now pinned ONLY by v_module_freshness (Step 4).

CREATE OR REPLACE VIEW v_sp_local_equity_di_vs_if AS
WITH fx AS (
  SELECT DISTINCT to_char(fecha,'YYYY-MM') AS periodo,
    first_value(valor) OVER (PARTITION BY to_char(fecha,'YYYY-MM') ORDER BY fecha DESC) AS usdclp
  FROM tipo_cambio WHERE instrumento_codigo::text = 'USDCLP Curncy'::text
),
direct AS (
  SELECT fecha AS fecha_reporte, to_char(fecha,'YYYY-MM') AS periodo, sum(monto_usdmm) AS direct_usd_mm
  FROM consolidated_sd WHERE source = '09' GROUP BY fecha
),
funds AS (
  SELECT cs.fecha AS fecha_reporte,
    sum(CASE WHEN bf.asset_class::text='Equity' AND bf.region::text='Chile' THEN cs.monto_usdmm ELSE 0 END) AS funds_usd_mm,
    sum(CASE WHEN bf.nt_asset_class='Equity' AND bf.nt_region='Chile' THEN cs.monto_usdmm ELSE 0 END) AS funds_usd_mm_nt
  FROM consolidated_sd cs
  JOIN dim_homol_funds h ON h.name::text = cs.nemotecnico AND h.source::text = 'AFP_CL'::text
  JOIN dim_bd_funds bf ON bf.id::text = h.id::text
  WHERE cs.source = '17' GROUP BY cs.fecha
)
SELECT d.fecha_reporte,
  d.direct_usd_mm * fx.usdclp / 1000.0 AS direct_clp_bn,
  COALESCE(f.funds_usd_mm * fx.usdclp / 1000.0, 0::numeric) AS funds_clp_bn,
  COALESCE(f.funds_usd_mm_nt * fx.usdclp / 1000.0, 0::numeric) AS funds_clp_bn_nt
FROM direct d
LEFT JOIN funds f ON f.fecha_reporte = d.fecha_reporte
LEFT JOIN fx ON fx.periodo = d.periodo;

DROP VIEW IF EXISTS v_sp_chilean_stocks_by_issuer;  -- orphan (its combined was dropped earlier; LE-DI no longer reads it)
DROP VIEW IF EXISTS v_sp_fi_local;                  -- orphan (only LE-DI read it)
