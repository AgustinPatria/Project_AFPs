-- ============================================================================
-- dim_chilean_stocks_gics_override + rebuild v_chilean_stocks_gics
--   Applied to Supabase 2026-05-28 via apply_migration. Saved here so the
--   DDL is version-controlled outside Supabase's internal migration history.
--
-- Purpose: align the dashboard /chilean-stocks GICS sector breakdown with
-- PDF Sec 05 AFPs column. Standard GICS (dim_ipd_instrumentos.sector_gics)
-- and Patria's BDChile dimensional disagree on ~6 issuers. Override is a
-- Patria-curated mapping joined into v_chilean_stocks_gics via COALESCE.
--
-- Validation Nov-25:
--   Real Est.   PDF 15.5  →  Dashboard 15.4   (was 15.0 before override)
--   Materials   PDF 12.8  →  Dashboard 12.9   (was 12.6 before)
--   Financials  PDF 20.0  →  Dashboard 20.5   (was 20.8 before)
--   Cons. Disc. PDF  6.3  →  Dashboard  6.1
--   The remaining ±0.5pp on Financials is residual classification gap
--   from holdings not in the override list (e.g. BANVIDA, BICECORP).
-- ============================================================================

CREATE TABLE IF NOT EXISTS dim_chilean_stocks_gics_override (
    emisor                   TEXT PRIMARY KEY,
    gics_sector_shortname    TEXT NOT NULL,
    notes                    TEXT
);

-- IMPORTANT: gics_sector_shortname must match dim_ipd_gics.gics_sector_shortname
-- exactly — Real Estate is abbreviated as 'Real Est.' there, not 'Real Estate'.
-- A mismatched override creates a duplicate row in the GICS card.
INSERT INTO dim_chilean_stocks_gics_override (emisor, gics_sector_shortname, notes) VALUES
  ('NORTE GRANDE S.A.',                       'Materials',
     'Holding company in the SOQUIMICH chain. GICS Financials; PDF/BDChile Materials.'),
  ('NITRATOS DE CHILE S.A.',                  'Materials',
     'Holding company in the SQM chain. GICS Financials; PDF/BDChile Materials.'),
  ('SOCIEDAD DE INVERSIONES ORO BLANCO S.A.', 'Materials',
     'Holding company in the SQM chain. GICS Financials; PDF/BDChile Materials.'),
  ('PAZ CORP S.A.',                           'Real Est.',
     'Real-estate developer. GICS Consumer Discretionary; PDF/BDChile Real Estate.'),
  ('SOCOVESA S.A.',                           'Real Est.',
     'Real-estate developer. GICS Consumer Discretionary; PDF/BDChile Real Estate.'),
  ('INMOBILIARIA MANQUEHUE S.A.',             'Real Est.',
     'Real-estate developer ("Inmobiliaria"). GICS Consumer Discretionary; PDF/BDChile Real Estate.')
ON CONFLICT (emisor) DO UPDATE
  SET gics_sector_shortname = EXCLUDED.gics_sector_shortname,
      notes = EXCLUDED.notes;

COMMENT ON TABLE dim_chilean_stocks_gics_override IS
  'Issuer-level overrides for v_chilean_stocks_gics so the GICS sector card matches the PDF Sec 05 AFPs column. Curated manually; see notes column.';

-- ----------------------------------------------------------------------------
-- Rebuild v_chilean_stocks_gics to apply the override via COALESCE.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_chilean_stocks_gics;

CREATE VIEW v_chilean_stocks_gics AS
WITH fx AS (
    SELECT fecha, valor AS usd_clp
    FROM tipo_cambio
    WHERE instrumento_codigo::text = 'USDCLP Curncy'::text
)
SELECT
    ch.fecha_reporte,
    ch.afp,
    ch.tipo_de_fondo AS multifondo,
    ch.nemotecnico_del_instrumento AS nemo,
    ch.nombre_del_emisor AS emisor,
    i.company_name,
    i.ticker_bbg,
    g.gics_sector AS gics_sub_industry_code,
    COALESCE(o.gics_sector_shortname, g.gics_sector_shortname) AS gics_sector,
    COALESCE(o.gics_sector_shortname, g.gics_sector_name)      AS gics_sector_name,
    g.gics_industry_group_name AS gics_industry_group,
    g.gics_industry_name AS gics_industry,
    SUM(
      ch.inversion / 1000000::numeric
      / COALESCE(
          (SELECT fx.usd_clp FROM fx WHERE fx.fecha = ch.fecha_reporte ORDER BY fx.fecha DESC LIMIT 1),
          (SELECT fx.usd_clp FROM fx WHERE fx.fecha <= ch.fecha_reporte ORDER BY fx.fecha DESC LIMIT 1)
        )
    ) AS monto_usd_mm,
    SUM(ch.inversion / 1000000::numeric) AS monto_clp_mm,
    SUM(ch.unidades) AS unidades
FROM historial_carteras_full ch
JOIN dim_chilean_ticker_homol h
  ON h.nemo = ch.nemotecnico_del_instrumento::text
JOIN dim_ipd_instrumentos i
  ON split_part(i.ticker_bbg, ' '::text, 1) = h.bbg_ticker
 AND i.ticker_bbg LIKE '%CI Equity'::text
LEFT JOIN dim_ipd_gics g
  ON g.sector_gics = i.sector_gics
LEFT JOIN dim_chilean_stocks_gics_override o
  ON o.emisor = ch.nombre_del_emisor
WHERE ch.tipo_de_instrumento::text = 'ACC'::text
GROUP BY
  ch.fecha_reporte, ch.afp, ch.tipo_de_fondo,
  ch.nemotecnico_del_instrumento, ch.nombre_del_emisor,
  i.company_name, i.ticker_bbg,
  g.gics_sector,
  COALESCE(o.gics_sector_shortname, g.gics_sector_shortname),
  COALESCE(o.gics_sector_shortname, g.gics_sector_name),
  g.gics_industry_group_name, g.gics_industry_name;
