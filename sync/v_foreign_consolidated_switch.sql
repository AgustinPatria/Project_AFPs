-- Foreign (Sec07/Sec10) — Step 1 of "lado SP" migration: SP XML -> consolidated_sd.
--
-- Re-points the foreign *summary* and *managers* off the SP XML two-hop (sp_fila/
-- sp_valor_fondo, cuadro 25) onto consolidated_sd (system-level, fresh, full history).
-- consolidated_sd Source IN ('25','17+25') == cuadro 25 foreign; nemotecnico == ISIN;
-- monto_usdmm already USD MM (no FX conversion, unlike the CHIST/CLP side).
--
-- Reconciliation vs the SP views (2024-11 .. 2026-05): total +0.16..0.20% every month
-- (consolidated is marginally MORE complete — ~18 extra FI nemos/month at system level).
-- Bucket-level 2026-04: DI +2, Equity +2, FI +187, PE +30. Managers: 173 rows both,
-- max single-manager diff 140 USD MM.
--
-- NOT migrated here (Step 3): Direct Investment instrument detail
-- (mv_sp_direct_investment_detail/summary) — consolidated_sd lacks `glosa`, so DI stays
-- on SP for now. The combined summary keeps pulling DI from mv_sp_direct_investment_summary.
--
-- Migrations: fase2_consolidated_foreign_parallel, fase2_switch_foreign_combined_to_consolidated.
-- The 'SP_XML' source literal is kept as the "fresh world" token so the front's
-- ForeignSource union ('CHIST'|'SP_XML') is unchanged; data no longer comes from SP XML.

-- ============================================================================
-- Parallel views off consolidated_sd (mirror the v_sp_foreign_* chain)
-- ============================================================================

CREATE OR REPLACE VIEW v_consolidated_foreign_classified AS
WITH fund_class AS (
  SELECT DISTINCT ON (h.name) h.name AS isin,
    bf.id AS fund_id, bf.fondo, bf.manager, bf.asset_class, bf.category, bf.region,
    bf.nt_asset_class, bf.nt_sub_asset_class, bf.nt_category, bf.nt_sub_category, bf.nt_region
  FROM dim_homol_funds h
  JOIN dim_bd_funds bf ON bf.id::text = h.id::text
  ORDER BY h.name, (CASE h.source
      WHEN 'AFP_CL' THEN 1 WHEN 'LICS_CL' THEN 2
      WHEN 'CARTERAS_FM_CMF' THEN 3 WHEN 'RUT_CMF' THEN 4 ELSE 5 END)
),
agg AS (
  SELECT fecha AS fecha_reporte, nemotecnico AS isin, sum(monto_usdmm) AS monto_dolares
  FROM consolidated_sd
  WHERE source IN ('25','17+25')
  GROUP BY fecha, nemotecnico
)
SELECT
  to_char(e.fecha_reporte,'YYYY-MM')                                   AS periodo,
  e.fecha_reporte,
  NULL::text                                                          AS emisor,   -- consolidated_sd has no glosa
  e.isin,
  e.monto_dolares,
  fc.fund_id, fc.fondo, fc.manager, fc.asset_class,
  COALESCE(NULLIF(TRIM(ov.category),'')::varchar(50), fc.category)    AS category,
  COALESCE(ovr.region, NULLIF(TRIM(ov.region),'')::varchar(50), fc.region) AS region,
  false                                                              AS is_sovereign,
  fc.nt_asset_class, fc.nt_sub_asset_class, fc.nt_category, fc.nt_sub_category, fc.nt_region
FROM agg e
LEFT JOIN fund_class fc ON fc.isin = e.isin
LEFT JOIN dim_foreign_region_override ovr ON ovr.fund_id = fc.fund_id::text
LEFT JOIN dim_foreign_classification_overlay ov ON upper(ov.identificador) = upper(e.isin)
WHERE e.monto_dolares > 0;

CREATE OR REPLACE VIEW v_consolidated_foreign_pdf AS
SELECT fecha_reporte, periodo, emisor, isin, monto_dolares, fund_id, asset_class, category, region, is_sovereign,
  CASE
    WHEN fund_id IS NOT NULL AND asset_class::text = 'Equity' THEN 'Equity'
    WHEN fund_id IS NOT NULL AND asset_class::text = 'Fixed Income' THEN 'Fixed Income'
    WHEN fund_id IS NOT NULL AND asset_class::text = 'Alternative' THEN 'Private Equity'
    WHEN fund_id IS NOT NULL AND asset_class::text = ANY (ARRAY['Balanced','AR/HF']) THEN 'Other'
    WHEN fund_id IS NULL THEN 'Direct Investment'
    ELSE 'Unknown' END AS pdf_bucket,
  CASE
    WHEN region::text = ANY (ARRAY['GEM','Latam','Asia Pacific','Asia Pacific ex Japan','Emerging Europe']) THEN 'Emerging Markets'
    WHEN region::text = ANY (ARRAY['Global','North America','Europe','Japan','Australia']) THEN 'Developed Markets'
    ELSE NULL END AS pdf_em_dm,
  CASE WHEN region::text = 'Asia Pacific' AND asset_class::text = 'Equity' THEN 'Asia Pacific ex Japan'::varchar ELSE region END AS pdf_subregion,
  CASE WHEN asset_class::text = 'Fixed Income' THEN category ELSE NULL::varchar END AS pdf_fi_category,
  CASE
    WHEN fund_id IS NOT NULL AND nt_asset_class = 'Equity' THEN 'Equity'
    WHEN fund_id IS NOT NULL AND nt_asset_class = 'Fixed Income' THEN 'Fixed Income'
    WHEN fund_id IS NOT NULL AND nt_asset_class = 'Alternative' THEN 'Private Equity'
    WHEN fund_id IS NOT NULL THEN 'Other'
    WHEN fund_id IS NULL THEN 'Direct Investment'
    ELSE 'Unknown' END AS pdf_bucket_nt,
  CASE
    WHEN nt_region = ANY (ARRAY['GEM','Latam','Brazil','Asia Pacific','Asia Pacific ex Japan','Emerging Europe','Middle East','RoW']) THEN 'Emerging Markets'
    WHEN nt_region = ANY (ARRAY['Global','North America','Europe','Japan','Australia']) THEN 'Developed Markets'
    ELSE NULL END AS pdf_em_dm_nt,
  CASE WHEN nt_region = 'Asia Pacific' AND nt_asset_class = 'Equity' THEN 'Asia Pacific ex Japan' ELSE nt_region END AS pdf_subregion_nt,
  CASE WHEN nt_asset_class = 'Fixed Income' THEN nt_sub_category ELSE NULL END AS pdf_fi_category_nt
FROM v_consolidated_foreign_classified;

-- DROP+CREATE on refresh of the source table; matview must be refreshed whenever
-- consolidated_sd is re-synced (add to the sync's post-load REFRESH list).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_consolidated_foreign_pdf_summary AS
SELECT fecha_reporte, pdf_bucket, pdf_em_dm, pdf_subregion, pdf_fi_category,
       pdf_bucket_nt, pdf_em_dm_nt, pdf_subregion_nt, pdf_fi_category_nt,
       sum(monto_dolares) AS monto_usd_mm
FROM v_consolidated_foreign_pdf
GROUP BY fecha_reporte, pdf_bucket, pdf_em_dm, pdf_subregion, pdf_fi_category,
         pdf_bucket_nt, pdf_em_dm_nt, pdf_subregion_nt, pdf_fi_category_nt;

CREATE OR REPLACE VIEW v_consolidated_foreign_managers AS
SELECT e.fecha_reporte, e.manager,
  CASE WHEN bf.style::text = ANY (ARRAY['ETF','Passive']) THEN 'Passive' ELSE 'Active' END AS fund_style,
  e.asset_class, e.category, e.region,
  e.nt_asset_class, e.nt_sub_asset_class, e.nt_category, e.nt_sub_category, e.nt_region,
  sum(e.monto_dolares) AS monto_usd_mm
FROM v_consolidated_foreign_classified e
LEFT JOIN dim_bd_funds bf ON bf.id::text = e.fund_id::text
WHERE e.fund_id IS NOT NULL
GROUP BY e.fecha_reporte, e.manager, bf.style, e.asset_class, e.category, e.region,
         e.nt_asset_class, e.nt_sub_asset_class, e.nt_category, e.nt_sub_category, e.nt_region;

-- ============================================================================
-- Switch the combined views (front consumes these via REST; no DB dependents)
-- ============================================================================

CREATE OR REPLACE VIEW v_foreign_pdf_summary_combined AS
-- (1) fresh non-DI/PE buckets from consolidated_sd
SELECT s.fecha_reporte::date,
       s.pdf_bucket::text, s.pdf_em_dm::text, s.pdf_subregion::varchar, s.pdf_fi_category::varchar,
       s.pdf_bucket_nt::text, s.pdf_em_dm_nt::text, s.pdf_subregion_nt::text, s.pdf_fi_category_nt::text,
       s.monto_usd_mm::numeric, 'SP_XML'::text AS source
FROM mv_consolidated_foreign_pdf_summary s
WHERE s.pdf_bucket <> ALL (ARRAY['Direct Investment','Private Equity'])
UNION ALL
-- (2) CHIST fallback only for fechas consolidated_sd does not cover (none in practice; resilience)
SELECT c.fecha_reporte::date,
       c.pdf_bucket::text, c.pdf_em_dm::text, c.pdf_subregion::varchar, c.pdf_fi_category::varchar,
       c.pdf_bucket_nt::text, c.pdf_em_dm_nt::text, c.pdf_subregion_nt::text, c.pdf_fi_category_nt::text,
       c.monto_usd_mm::numeric, 'CHIST'::text AS source
FROM v_foreign_pdf_summary c
WHERE (c.pdf_bucket <> ALL (ARRAY['Direct Investment','Private Equity']))
  AND c.fecha_reporte NOT IN (SELECT DISTINCT s.fecha_reporte FROM mv_consolidated_foreign_pdf_summary s
                              WHERE s.pdf_bucket <> ALL (ARRAY['Direct Investment','Private Equity']))
UNION ALL
-- (3) SP Direct Investment instrument-level summary (UNCHANGED — migrates in Step 3)
SELECT d.fecha_reporte::date,
       d.pdf_bucket::text, d.pdf_em_dm::text, d.pdf_subregion::varchar, d.pdf_fi_category::varchar,
       d.pdf_bucket::text, d.pdf_em_dm::text, d.pdf_subregion::text, d.pdf_fi_category::text,
       d.monto_usd_mm::numeric, 'SP_XML'::text AS source
FROM mv_sp_direct_investment_summary d
UNION ALL
-- (4) Private Equity from consolidated_sd
SELECT s.fecha_reporte::date,
       s.pdf_bucket::text, s.pdf_em_dm::text, s.pdf_subregion::varchar, s.pdf_fi_category::varchar,
       s.pdf_bucket_nt::text, s.pdf_em_dm_nt::text, s.pdf_subregion_nt::text, s.pdf_fi_category_nt::text,
       s.monto_usd_mm::numeric, 'SP_XML'::text AS source
FROM mv_consolidated_foreign_pdf_summary s
WHERE s.pdf_bucket = 'Private Equity';

CREATE OR REPLACE VIEW v_foreign_managers_combined AS
SELECT m.fecha_reporte::date,
       m.manager::varchar(100), m.fund_style::text,
       m.asset_class::varchar(50), m.category::varchar(50), m.region::varchar(50),
       m.nt_asset_class::text, m.nt_sub_asset_class::text, m.nt_category::text, m.nt_sub_category::text, m.nt_region::text,
       m.monto_usd_mm::numeric, 'SP_XML'::text AS source
FROM v_consolidated_foreign_managers m
UNION ALL
SELECT c.fecha_reporte::date,
       c.manager::varchar(100), c.fund_style::text,
       c.asset_class::varchar(50), c.category::varchar(50), c.region::varchar(50),
       c.nt_asset_class::text, c.nt_sub_asset_class::text, c.nt_category::text, c.nt_sub_category::text, c.nt_region::text,
       c.monto_usd_mm::numeric, 'CHIST'::text AS source
FROM v_chist_foreign_managers c
WHERE c.fecha_reporte NOT IN (SELECT DISTINCT m2.fecha_reporte FROM v_consolidated_foreign_managers m2);
