-- Foreign Direct Investment detail/summary (Sec07 p6) — Step 3: SP -> consolidated_sd.
-- Migration: fase3_di_detail_to_consolidated.
--
-- DEEP INVESTIGATION (2026-06-26): consolidated_sd has nemotecnico(=ISIN) but no glosa; SP matched
-- the DI overlay by nemo OR glosa. The glosa-only rows split into:
--   (a) 22 bank-counterparty DERIVATIVE nets (sp_fila cuadro 25 filas 76-88, nemotecnico NULL,
--       both +/- values, net -564 USD MM/mo). consolidated_sd correctly excludes these (they are
--       FX-forward/swap MTM by counterparty bank, NOT direct investments). The dashboard already
--       shows derivatives in Asset Allocation 'Foreign Derivatives' (-2096 USD MM @2026-05); folding
--       them into DI would double-represent derivatives. -> excluded automatically (no ISIN to match).
--   (b) EXACTLY 4 real bonds across ALL history (IFC x3, EBRD x1) classifiable via glosa, +62 USD MM.
--       -> backfilled as ISIN-keyed overlay rows so consolidated reproduces SP's nemo-OR-glosa match.
--
-- Result @2026-05: DI = 5304 (5242 overlay-ISIN + 62 backfill) vs SP 4739. Gap +565 == the excluded
-- derivative counterparties (100% attributable). Foreign total 136362 -> 136928. DI detail fresh to
-- 2026-05. v_sp_direct_investment_detail no longer reads sp_fila/sp_valor_fondo (DI off SP).
--
-- UI DISCLAIMER (like Pearl Diver / Aegon): foreign Direct Investment excludes derivative-counterparty
-- net exposure (~-560 USD MM/mo, shown in Asset Allocation Foreign Derivatives), so the DI bucket runs
-- ~+12% above the PDF, which sweeps those nets into DI / FI / Bank.
--
-- Name v_sp_direct_investment_detail kept (now a misnomer; cosmetic, like the 'SP_XML' source token).
-- The two matviews reading it (mv_sp_direct_investment_detail = front DI card; mv_sp_direct_investment_summary
-- -> v_foreign_pdf_summary_combined part 3) only needed REFRESH.

INSERT INTO dim_direct_investment_overlay (identificador, emisor_norm, asset_class, region, country, di_category, currency, loaded_at)
SELECT v.*, now() FROM (VALUES
  ('XS2177447179','INTERNATIONAL FINANCE CORP','Fixed Income','Latam','Colombia','Corporate','COP'),
  ('XS2977993471','INTERNATIONAL FINANCE CORP','Fixed Income','Latam','Colombia','Corporate','COP'),
  ('XS3384654755','INTERNATIONAL FINANCE CORP','Fixed Income','Latam','Colombia','Corporate','COP'),
  ('XS2438631710','EUROPEAN BANK FOR RECONSTRUCTION & DEVELOPMENT','Fixed Income','Latam','Brazil','Corporate','BRL')
) v(identificador, emisor_norm, asset_class, region, country, di_category, currency)
WHERE NOT EXISTS (SELECT 1 FROM dim_direct_investment_overlay o WHERE upper(o.identificador)=upper(v.identificador));

CREATE OR REPLACE VIEW v_sp_direct_investment_detail AS
WITH agg AS (
  SELECT fecha, nemotecnico, sum(monto_usdmm) AS usd_mm
  FROM consolidated_sd
  WHERE source IN ('25','17+25')
  GROUP BY fecha, nemotecnico
),
ov AS (
  SELECT DISTINCT ON (upper(identificador)) upper(identificador) AS id,
         asset_class, di_category, country, region, currency
  FROM dim_direct_investment_overlay
  ORDER BY upper(identificador)
)
SELECT
  to_char(a.fecha,'YYYY-MM')::text AS periodo,
  a.fecha AS fecha_valor,
  a.nemotecnico::text,
  NULL::text AS glosa,
  ov.asset_class::text, ov.di_category::text, ov.country::text, ov.region::text, ov.currency::text,
  a.usd_mm::numeric
FROM agg a
JOIN ov ON ov.id = upper(a.nemotecnico);

REFRESH MATERIALIZED VIEW mv_sp_direct_investment_detail;
REFRESH MATERIALIZED VIEW mv_sp_direct_investment_summary;
