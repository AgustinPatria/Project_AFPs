-- ============================================================================
-- Ajustes_Dashboard 1.3 (corrección real) — Alternatives como CLASE PROPIA por
-- AFP y por tipo de fondo, con split Local/Foreign, en el matrix de Asset
-- Allocation y en la tabla OW/UW.
--
-- Hallazgo: sd_asset_class_afp / sd_asset_class_tipo (fuente SP _sd) traen los
-- alternativos EXPLÍCITOS en la columna `glosa` = 'Activos Alternativos', pero
-- anidados bajo nivel_2 (RENTA VARIABLE / RENTA FIJA). El CASE anterior leía
-- solo nivel_1+nivel_2 e ignoraba glosa, así que los fundía dentro de Foreign
-- Equity / Local Fixed Income / Local Equity.
--
-- Fix: se carve-out por `glosa ~~* '%alternativ%'` a 'Local Alternatives' /
-- 'Foreign Alternatives' (evaluado ANTES de las ramas RV/RF), quedando FUERA de
-- Total Equity / Total Fixed Income. Se agrega el subtotal 'Total Alternatives'.
-- Total Assets y el 100% se preservan (los alternativos pasan de estar dentro
-- de Eq/FI a ser sus propios leaves). pdf_order renumerado 1..16.
--
-- Decisión (confirmada): la cifra que se resta es la de SP (self-consistente,
-- sin desfase). CHIST manda como referencia autoritativa del universo alt
-- completo (módulo Alternative Assets, ~4m desfase) — documentado en el
-- disclaimer del dashboard. La cifra SP ('Activos Alternativos' regulatorio) es
-- más acotada y NO reconcilia con CHIST a propósito.
-- Migration: sd_asset_class_carve_out_alternatives (ProjectAFP_v2 vmeh...).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_asset_class_afp_sd AS
WITH mapped AS (
  SELECT s.fecha, s.afp,
    CASE
      WHEN s.nivel_1 ~~* '%NACIONAL%'   AND s.glosa ~~* '%alternativ%'    THEN 'Local Alternatives'
      WHEN s.nivel_1 ~~* '%EXTRANJERA%' AND s.glosa ~~* '%alternativ%'    THEN 'Foreign Alternatives'
      WHEN s.nivel_1 ~~* '%NACIONAL%'   AND s.nivel_2 = 'RENTA VARIABLE'  THEN 'Local Equity'
      WHEN s.nivel_1 ~~* '%NACIONAL%'   AND s.nivel_2 = 'RENTA FIJA'      THEN 'Local Fixed Income'
      WHEN s.nivel_1 ~~* '%NACIONAL%'   AND s.nivel_2 = 'DERIVADOS'       THEN 'Local Derivatives'
      WHEN s.nivel_1 ~~* '%NACIONAL%'                                     THEN 'Local Other'
      WHEN s.nivel_1 ~~* '%EXTRANJERA%' AND s.nivel_2 = 'RENTA VARIABLE'  THEN 'Foreign Equity'
      WHEN s.nivel_1 ~~* '%EXTRANJERA%' AND s.nivel_2 = 'RENTA FIJA'      THEN 'Foreign Fixed Income'
      WHEN s.nivel_1 ~~* '%EXTRANJERA%' AND s.nivel_2 = 'DERIVADOS'       THEN 'Foreign Derivatives'
      WHEN s.nivel_1 ~~* '%EXTRANJERA%'                                   THEN 'Foreign Other'
      ELSE NULL
    END AS pdf_category,
    s.monto_usdmm
  FROM sd_asset_class_afp s
),
leaves AS (
  SELECT fecha, afp, pdf_category, sum(monto_usdmm) AS monto
  FROM mapped WHERE pdf_category IS NOT NULL
  GROUP BY fecha, afp, pdf_category
),
allcat AS (
  SELECT fecha, afp, pdf_category, monto FROM leaves
  UNION ALL SELECT fecha, afp, 'Total Local',        sum(monto) FROM leaves WHERE pdf_category ~~ 'Local%'   GROUP BY fecha, afp
  UNION ALL SELECT fecha, afp, 'Total Foreign',      sum(monto) FROM leaves WHERE pdf_category ~~ 'Foreign%' GROUP BY fecha, afp
  UNION ALL SELECT fecha, afp, 'Total Equity',       sum(monto) FROM leaves WHERE pdf_category = ANY (ARRAY['Local Equity','Foreign Equity'])             GROUP BY fecha, afp
  UNION ALL SELECT fecha, afp, 'Total Fixed Income', sum(monto) FROM leaves WHERE pdf_category = ANY (ARRAY['Local Fixed Income','Foreign Fixed Income']) GROUP BY fecha, afp
  UNION ALL SELECT fecha, afp, 'Total Alternatives', sum(monto) FROM leaves WHERE pdf_category = ANY (ARRAY['Local Alternatives','Foreign Alternatives']) GROUP BY fecha, afp
  UNION ALL SELECT fecha, afp, 'Total Assets',       sum(monto) FROM leaves GROUP BY fecha, afp
),
allcat2 AS (
  SELECT fecha, afp, pdf_category, monto FROM allcat
  UNION ALL
  SELECT fecha, 'TOTAL'::text AS afp, pdf_category, sum(monto) AS monto FROM allcat GROUP BY fecha, pdf_category
),
ta AS (
  SELECT fecha, afp, monto AS total_assets FROM allcat2 WHERE pdf_category = 'Total Assets'
)
SELECT a.fecha AS fecha_valor,
  to_char(a.fecha::timestamptz, 'YYYY-MM') AS periodo,
  a.afp AS afp_nombre,
  'TOTAL'::text AS tipo_fondo,
  a.pdf_category,
  CASE a.pdf_category
    WHEN 'Local Equity' THEN 1 WHEN 'Local Fixed Income' THEN 2 WHEN 'Local Derivatives' THEN 3
    WHEN 'Local Alternatives' THEN 4 WHEN 'Local Other' THEN 5 WHEN 'Total Local' THEN 6
    WHEN 'Foreign Equity' THEN 7 WHEN 'Foreign Fixed Income' THEN 8 WHEN 'Foreign Derivatives' THEN 9
    WHEN 'Foreign Alternatives' THEN 10 WHEN 'Foreign Other' THEN 11 WHEN 'Total Foreign' THEN 12
    WHEN 'Total Equity' THEN 13 WHEN 'Total Fixed Income' THEN 14 WHEN 'Total Alternatives' THEN 15
    WHEN 'Total Assets' THEN 16 ELSE NULL
  END AS pdf_order,
  a.monto AS monto_dolares,
  CASE WHEN t.total_assets IS NULL OR t.total_assets = 0 THEN NULL
       ELSE round(100.0 * a.monto / t.total_assets, 2) END AS porcentaje
FROM allcat2 a
LEFT JOIN ta t ON t.fecha = a.fecha AND t.afp = a.afp;


CREATE OR REPLACE VIEW public.v_asset_class_tipo_sd AS
WITH mapped AS (
  SELECT b.fecha, b.tipo_fondo,
    CASE
      WHEN b.nivel_1 ~~* '%NACIONAL%'   AND b.glosa ~~* '%alternativ%'    THEN 'Local Alternatives'
      WHEN b.nivel_1 ~~* '%EXTRANJERA%' AND b.glosa ~~* '%alternativ%'    THEN 'Foreign Alternatives'
      WHEN b.nivel_1 ~~* '%NACIONAL%'   AND b.nivel_2 = 'RENTA VARIABLE'  THEN 'Local Equity'
      WHEN b.nivel_1 ~~* '%NACIONAL%'   AND b.nivel_2 = 'RENTA FIJA'      THEN 'Local Fixed Income'
      WHEN b.nivel_1 ~~* '%NACIONAL%'   AND b.nivel_2 = 'DERIVADOS'       THEN 'Local Derivatives'
      WHEN b.nivel_1 ~~* '%NACIONAL%'                                     THEN 'Local Other'
      WHEN b.nivel_1 ~~* '%EXTRANJERA%' AND b.nivel_2 = 'RENTA VARIABLE'  THEN 'Foreign Equity'
      WHEN b.nivel_1 ~~* '%EXTRANJERA%' AND b.nivel_2 = 'RENTA FIJA'      THEN 'Foreign Fixed Income'
      WHEN b.nivel_1 ~~* '%EXTRANJERA%' AND b.nivel_2 = 'DERIVADOS'       THEN 'Foreign Derivatives'
      WHEN b.nivel_1 ~~* '%EXTRANJERA%'                                   THEN 'Foreign Other'
      ELSE NULL
    END AS pdf_category,
    b.monto_usdmm
  FROM (
    SELECT fecha, tipo_fondo, nivel_1, nivel_2, glosa, monto_usdmm FROM sd_asset_class_tipo
    UNION ALL
    SELECT fecha, 'TOTAL'::text AS tipo_fondo, nivel_1, nivel_2, glosa, monto_usdmm FROM sd_asset_class_tipo
  ) b
),
leaves AS (
  SELECT fecha, tipo_fondo, pdf_category, sum(monto_usdmm) AS monto
  FROM mapped WHERE pdf_category IS NOT NULL
  GROUP BY fecha, tipo_fondo, pdf_category
),
allcat AS (
  SELECT fecha, tipo_fondo, pdf_category, monto FROM leaves
  UNION ALL SELECT fecha, tipo_fondo, 'Total Local',        sum(monto) FROM leaves WHERE pdf_category ~~ 'Local%'   GROUP BY fecha, tipo_fondo
  UNION ALL SELECT fecha, tipo_fondo, 'Total Foreign',      sum(monto) FROM leaves WHERE pdf_category ~~ 'Foreign%' GROUP BY fecha, tipo_fondo
  UNION ALL SELECT fecha, tipo_fondo, 'Total Equity',       sum(monto) FROM leaves WHERE pdf_category = ANY (ARRAY['Local Equity','Foreign Equity'])             GROUP BY fecha, tipo_fondo
  UNION ALL SELECT fecha, tipo_fondo, 'Total Fixed Income', sum(monto) FROM leaves WHERE pdf_category = ANY (ARRAY['Local Fixed Income','Foreign Fixed Income']) GROUP BY fecha, tipo_fondo
  UNION ALL SELECT fecha, tipo_fondo, 'Total Alternatives', sum(monto) FROM leaves WHERE pdf_category = ANY (ARRAY['Local Alternatives','Foreign Alternatives']) GROUP BY fecha, tipo_fondo
  UNION ALL SELECT fecha, tipo_fondo, 'Total Assets',       sum(monto) FROM leaves GROUP BY fecha, tipo_fondo
),
ta AS (
  SELECT fecha, tipo_fondo, monto AS total_assets FROM allcat WHERE pdf_category = 'Total Assets'
)
SELECT a.fecha AS fecha_valor,
  to_char(a.fecha::timestamptz, 'YYYY-MM') AS periodo,
  a.tipo_fondo,
  a.pdf_category,
  CASE a.pdf_category
    WHEN 'Local Equity' THEN 1 WHEN 'Local Fixed Income' THEN 2 WHEN 'Local Derivatives' THEN 3
    WHEN 'Local Alternatives' THEN 4 WHEN 'Local Other' THEN 5 WHEN 'Total Local' THEN 6
    WHEN 'Foreign Equity' THEN 7 WHEN 'Foreign Fixed Income' THEN 8 WHEN 'Foreign Derivatives' THEN 9
    WHEN 'Foreign Alternatives' THEN 10 WHEN 'Foreign Other' THEN 11 WHEN 'Total Foreign' THEN 12
    WHEN 'Total Equity' THEN 13 WHEN 'Total Fixed Income' THEN 14 WHEN 'Total Alternatives' THEN 15
    WHEN 'Total Assets' THEN 16 ELSE NULL
  END AS pdf_order,
  a.monto AS monto_dolares,
  CASE WHEN t.total_assets IS NULL OR t.total_assets = 0 THEN NULL
       ELSE round(100.0 * a.monto / t.total_assets, 2) END AS porcentaje
FROM allcat a
LEFT JOIN ta t ON t.fecha = a.fecha AND t.tipo_fondo = a.tipo_fondo;
