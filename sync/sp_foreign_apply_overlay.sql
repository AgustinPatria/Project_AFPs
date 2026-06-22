-- Migration: sp_foreign_apply_overlay
-- Aplica dim_foreign_classification_overlay (hoja Output_25sd del Excel legacy,
-- la clasificación maestra con la que se imprime el PDF Sec 07) a la rama SP XML.
-- Hasta ahora el overlay solo se usaba en la rama CHIST; la rama SP clasificaba
-- únicamente vía dim_homol_funds → dim_bd_funds, lo que producía diffs de
-- subregión vs PDF (p.ej. FI Europe 122 vs 1,043 del PDF Nov-25).
--
-- Prioridad de clasificación (region):
--   1. dim_foreign_region_override (override manual por fund_id, validado vs PDF)
--   2. dim_foreign_classification_overlay (Output_25sd, por ISIN) — NULLIF para
--      no pisar con vacíos
--   3. dim_bd_funds (via dim_homol_funds)
-- category: overlay > dim_bd_funds. asset_class NO se toca (los buckets ya
-- cuadran ±3 USD mm; cambiarlo movería plata entre buckets — evaluar aparte).
-- Columnas nt_* intactas (taxonomía nueva, independiente del PDF legacy).

CREATE OR REPLACE VIEW v_sp_foreign_classified AS
WITH fund_class AS (
  SELECT DISTINCT ON (h.name) h.name AS isin,
    bf.id AS fund_id,
    bf.fondo,
    bf.manager,
    bf.asset_class,
    bf.category,
    bf.region,
    bf.nt_asset_class,
    bf.nt_sub_asset_class,
    bf.nt_category,
    bf.nt_sub_category,
    bf.nt_region
  FROM dim_homol_funds h
  JOIN dim_bd_funds bf ON bf.id::text = h.id::text
  ORDER BY h.name, (
    CASE h.source
      WHEN 'AFP_CL' THEN 1
      WHEN 'LICS_CL' THEN 2
      WHEN 'CARTERAS_FM_CMF' THEN 3
      WHEN 'RUT_CMF' THEN 4
      ELSE 5
    END)
)
SELECT e.periodo,
  (date_trunc('month', ((e.periodo || '-01')::date)::timestamp with time zone)
     + '1 mon'::interval - '1 day'::interval)::date AS fecha_reporte,
  e.fila_numero,
  e.emisor,
  e.isin,
  e.tipo_fondo,
  e.monto_dolares,
  fc.fund_id,
  fc.fondo,
  fc.manager,
  fc.asset_class,
  COALESCE(NULLIF(trim(ov.category), '')::varchar(50), fc.category) AS category,
  COALESCE(ovr.region,
           NULLIF(trim(ov.region), '')::varchar(50),
           fc.region) AS region,
  fc.fund_id IS NULL AND e.isin IS NOT NULL AND e.emisor LIKE 'GOVERNMENT OF %' AS is_sovereign,
  fc.nt_asset_class,
  fc.nt_sub_asset_class,
  fc.nt_category,
  fc.nt_sub_category,
  fc.nt_region
FROM v_sp_emisor_extranjero e
  LEFT JOIN fund_class fc ON fc.isin::text = e.isin
  LEFT JOIN dim_foreign_region_override ovr ON ovr.fund_id = fc.fund_id::text
  LEFT JOIN dim_foreign_classification_overlay ov ON upper(ov.identificador) = upper(e.isin)
WHERE e.tipo_fondo = 'TOTAL' AND NOT e.es_subtotal AND e.monto_dolares > 0 AND e.isin IS NOT NULL;

-- El overlay trae la etiqueta explícita 'Asia Pacific ex Japan' (Equity).
-- El array EM legacy debe reconocerla (la rama CHIST ya lo hace) y el DM suma
-- 'Australia' por paridad con CHIST. Sin esto, 23 bn de Equity EM caerían a NULL.
CREATE OR REPLACE VIEW v_sp_foreign_pdf AS
SELECT fecha_reporte,
  periodo,
  emisor,
  isin,
  monto_dolares,
  fund_id,
  asset_class,
  category,
  region,
  is_sovereign,
  CASE
    WHEN fund_id IS NOT NULL AND asset_class::text = 'Equity' THEN 'Equity'
    WHEN fund_id IS NOT NULL AND asset_class::text = 'Fixed Income' THEN 'Fixed Income'
    WHEN fund_id IS NOT NULL AND asset_class::text = 'Alternative' THEN 'Private Equity'
    WHEN fund_id IS NOT NULL AND asset_class::text IN ('Balanced', 'AR/HF') THEN 'Other'
    WHEN fund_id IS NULL THEN 'Direct Investment'
    ELSE 'Unknown'
  END AS pdf_bucket,
  CASE
    WHEN region::text IN ('GEM', 'Latam', 'Asia Pacific', 'Asia Pacific ex Japan', 'Emerging Europe') THEN 'Emerging Markets'
    WHEN region::text IN ('Global', 'North America', 'Europe', 'Japan', 'Australia') THEN 'Developed Markets'
    ELSE NULL
  END AS pdf_em_dm,
  CASE
    WHEN region::text = 'Asia Pacific' AND asset_class::text = 'Equity' THEN 'Asia Pacific ex Japan'::character varying
    ELSE region
  END AS pdf_subregion,
  CASE
    WHEN asset_class::text = 'Fixed Income' THEN category
    ELSE NULL::character varying
  END AS pdf_fi_category,
  CASE
    WHEN fund_id IS NOT NULL AND nt_asset_class = 'Equity' THEN 'Equity'
    WHEN fund_id IS NOT NULL AND nt_asset_class = 'Fixed Income' THEN 'Fixed Income'
    WHEN fund_id IS NOT NULL AND nt_asset_class = 'Alternative' THEN 'Private Equity'
    WHEN fund_id IS NOT NULL THEN 'Other'
    WHEN fund_id IS NULL THEN 'Direct Investment'
    ELSE 'Unknown'
  END AS pdf_bucket_nt,
  CASE
    WHEN nt_region IN ('GEM', 'Latam', 'Brazil', 'Asia Pacific', 'Asia Pacific ex Japan', 'Emerging Europe', 'Middle East', 'RoW') THEN 'Emerging Markets'
    WHEN nt_region IN ('Global', 'North America', 'Europe', 'Japan', 'Australia') THEN 'Developed Markets'
    ELSE NULL
  END AS pdf_em_dm_nt,
  CASE
    WHEN nt_region = 'Asia Pacific' AND nt_asset_class = 'Equity' THEN 'Asia Pacific ex Japan'
    ELSE nt_region
  END AS pdf_subregion_nt,
  CASE
    WHEN nt_asset_class = 'Fixed Income' THEN nt_sub_category
    ELSE NULL
  END AS pdf_fi_category_nt
FROM v_sp_foreign_classified;

REFRESH MATERIALIZED VIEW mv_sp_foreign_pdf_summary;
