-- ============================================================================
-- Fase 2 · Switch del lado CHIST de Foreign al modelo SQL fuente unica
-- Aplicado a Supabase 2026-06-25 (migrations fase2_switch_chist_foreign_classified
-- + fase2_refresh_chist_foreign_matviews). Versionado aqui.
--
-- v_chist_foreign_classified: fuente historial_carteras_full -> chist_adjusted.
-- Reescrita EN SITIO (37 cols type-matched para no romper dependientes
-- v_chist_foreign_pdf / v_foreign_latam_monthly). Las 2 cols podadas en
-- chist_adjusted (grupo_economico, unidad_de_reajuste_de_moneda) van como NULL:
-- no se usan aguas arriba.
--
-- Reconciliacion: summary CHIST (v_foreign_pdf_summary) BYTE-IDENTICO al baseline.
-- Los derivados extranjeros que chist_adjusted excluye ya se excluian en el matview
-- (WHERE pdf_bucket <> 'Excluded Derivatives').
--
-- Tras el CREATE OR REPLACE hay que refrescar los matviews CHIST de Foreign.
-- PENDIENTE: lado SP (v_sp_foreign_classified <- sp_*) -> consolidated_sd; flows BBG.
-- ============================================================================
CREATE OR REPLACE VIEW public.v_chist_foreign_classified AS
WITH fund_class AS (
  SELECT DISTINCT ON (h.name) h.name AS nemo, bf.id AS fund_id, bf.fondo, bf.manager,
         bf.type AS fund_type, bf.style AS fund_style, bf.asset_class, bf.category, bf.region,
         bf.alt_fund_type, bf.alt_strategy,
         bf.nt_asset_class, bf.nt_sub_asset_class, bf.nt_category, bf.nt_sub_category, bf.nt_region
  FROM dim_homol_funds h
  JOIN dim_bd_funds bf ON bf.id::text = h.id::text
  ORDER BY h.name, (CASE h.source WHEN 'AFP_CL' THEN 1 WHEN 'LICS_CL' THEN 2
                                  WHEN 'CARTERAS_FM_CMF' THEN 3 WHEN 'RUT_CMF' THEN 4 ELSE 5 END)
)
SELECT hc.fecha::date AS fecha, hc.fecha_reporte::date AS fecha_reporte,
       hc.afp::varchar(50) AS afp, hc.tipo_de_fondo::varchar(10) AS tipo_de_fondo,
       hc.tipo_de_instrumento::varchar(20) AS tipo_de_instrumento,
       hc.nemotecnico::varchar(100) AS nemo, hc.nombre_del_emisor::varchar(255) AS nombre_del_emisor,
       NULL::varchar(20) AS unidad_de_reajuste_de_moneda,
       hc.unidades::numeric(30,8) AS unidades, hc.precio::numeric(30,8) AS precio,
       hc.inversion::numeric(30,4) AS inversion, NULL::varchar(255) AS grupo_economico,
       fc.fund_id::varchar(50) AS fund_id, fc.fondo::varchar(255) AS fondo,
       fc.manager::varchar(100) AS manager, fc.fund_type::varchar(50) AS fund_type,
       fc.fund_style::varchar(50) AS fund_style, fc.asset_class::varchar(50) AS asset_class,
       COALESCE(ov.category::varchar(50), fc.category::varchar(50))::varchar(50) AS category,
       COALESCE(ov.region::varchar(50), fc.region::varchar(50))::varchar(50) AS region,
       fc.alt_fund_type::varchar(50) AS alt_fund_type, fc.alt_strategy::varchar(100) AS alt_strategy,
       dil.name::text AS direct_inv_name, dil.asset_class::text AS direct_inv_asset_class,
       dil.region::text AS direct_inv_region, tisp.descripcion::text AS sp_descripcion,
       tisp.c1::varchar(50) AS sp_c1, tisp.c2::varchar(50) AS sp_c2, tisp.c3::varchar(50) AS sp_c3,
       tisp.c4::varchar(100) AS sp_c4,
       COALESCE(fc.asset_class, dil.asset_class::varchar, tisp.c4::varchar)::varchar AS asset_class_eff,
       COALESCE(ov.region::varchar(50), fc.region, dil.region::varchar)::varchar AS region_eff,
       fc.nt_asset_class::text AS nt_asset_class, fc.nt_sub_asset_class::text AS nt_sub_asset_class,
       fc.nt_category::text AS nt_category, fc.nt_sub_category::text AS nt_sub_category,
       fc.nt_region::text AS nt_region
FROM chist_adjusted hc
  LEFT JOIN fund_class fc ON fc.nemo::text = hc.nemotecnico::text
  LEFT JOIN dim_bd_direct_inv_lics dil ON dil.nemo = hc.nemotecnico::text
  LEFT JOIN dim_tipo_instrumento_sp tisp ON tisp.codigo::text = hc.tipo_de_instrumento::text
  LEFT JOIN dim_foreign_classification_overlay ov ON upper(ov.identificador) = upper(hc.nemotecnico::text)
WHERE hc.nacionalidad_del_emisor::text = 'E'::text;

REFRESH MATERIALIZED VIEW public.mv_foreign_pdf_summary;
REFRESH MATERIALIZED VIEW public.mv_chist_foreign_managers;
REFRESH MATERIALIZED VIEW public.mv_chist_foreign_by_fund;
REFRESH MATERIALIZED VIEW public.mv_chist_foreign_units_by_nemo;
