-- ============================================================================
-- Fase 2 · Switch de Chilean Stocks GICS al modelo SQL fuente unica
-- Aplicado a Supabase 2026-06-25 (migration fase2_switch_chilean_stocks_gics). Versionado aqui.
--
-- v_chilean_stocks_gics: fuente historial_carteras_full -> chist_adjusted
-- (acciones nacionales, tipo_de_instrumento='ACC' = Supracategory 'Direct Inv. RV Nacional').
-- Resto idéntico: cadena GICS (dim_chilean_ticker_homol -> dim_ipd_instrumentos ->
-- dim_ipd_gics) + override (dim_chilean_stocks_gics_override), FX USDCLP Curncy.
-- Reconciliado EXACTO vs historial (diff=0 en 6 fechas). f_sec05_* siguen OK.
-- Mismo lag que antes (chist_adjusted 2025+, = historial_carteras_full).
--
-- Nota: dim_chilean_ticker_homol sigue siendo manual (hueco conocido).
-- Freshness (consolidated_sd) DIFERIDO: consolidated_sd no trae nombre_del_emisor,
-- necesario para el join del override GICS.
-- ============================================================================
DROP VIEW IF EXISTS public.v_chilean_stocks_gics;

CREATE VIEW public.v_chilean_stocks_gics AS
WITH fx AS (
  SELECT fecha, valor AS usd_clp FROM tipo_cambio WHERE instrumento_codigo::text = 'USDCLP Curncy'::text
)
SELECT ch.fecha_reporte, ch.afp, ch.tipo_de_fondo AS multifondo,
       ch.nemotecnico AS nemo, ch.nombre_del_emisor AS emisor,
       i.company_name, i.ticker_bbg,
       g.gics_sector AS gics_sub_industry_code,
       COALESCE(o.gics_sector_shortname, g.gics_sector_shortname) AS gics_sector,
       COALESCE(o.gics_sector_shortname, g.gics_sector_name) AS gics_sector_name,
       g.gics_industry_group_name AS gics_industry_group,
       g.gics_industry_name AS gics_industry,
       sum(ch.inversion / 1000000::numeric / COALESCE(
             (SELECT fx.usd_clp FROM fx WHERE fx.fecha = ch.fecha_reporte ORDER BY fx.fecha DESC LIMIT 1),
             (SELECT fx.usd_clp FROM fx WHERE fx.fecha <= ch.fecha_reporte ORDER BY fx.fecha DESC LIMIT 1))) AS monto_usd_mm,
       sum(ch.inversion / 1000000::numeric) AS monto_clp_mm,
       sum(ch.unidades) AS unidades
FROM chist_adjusted ch
  JOIN dim_chilean_ticker_homol h ON h.nemo = ch.nemotecnico::text
  JOIN dim_ipd_instrumentos i ON split_part(i.ticker_bbg, ' '::text, 1) = h.bbg_ticker AND i.ticker_bbg ~~ '%CI Equity'::text
  LEFT JOIN dim_ipd_gics g ON g.sector_gics = i.sector_gics
  LEFT JOIN dim_chilean_stocks_gics_override o ON o.emisor = ch.nombre_del_emisor::text
WHERE ch.tipo_de_instrumento::text = 'ACC'::text
GROUP BY ch.fecha_reporte, ch.afp, ch.tipo_de_fondo, ch.nemotecnico, ch.nombre_del_emisor,
         i.company_name, i.ticker_bbg, g.gics_sector,
         (COALESCE(o.gics_sector_shortname, g.gics_sector_shortname)),
         (COALESCE(o.gics_sector_shortname, g.gics_sector_name)),
         g.gics_industry_group_name, g.gics_industry_name;
