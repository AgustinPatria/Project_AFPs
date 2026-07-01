-- Foreign returns/flows (Sec07 p4-5 + Sec08) — Step 2: SP + bbg_returns_foreign -> consolidated_sd + bbg_returns.
-- Migrations: fase2_foreign_flows_to_consolidated_bbg, fase2_drop_orphan_sp_foreign_chain.
--
-- v_foreign_returns_flows: positions v_sp_foreign_pdf -> v_consolidated_foreign_pdf;
-- returns bbg_returns_foreign(fecha,nemo,ret_usd_pct) -> bbg_returns(end_date,nemo_sp,usd_ret).
-- bbg_returns is bbg_returns_foreign with renamed cols (+start_date); same data, join by nemo_sp.
-- Coverage 2026-03 by nemo_sp == old by nemo (402 vs 401). usd_ret is a percentage (÷100).
--
-- Results: flows/returns advance to 2026-05 (old capped at 2026-03, limited by both SP positions
-- starting 2024-11 and bbg_returns_foreign). Parity 2026-03 vs old (totals): change -9784 vs -9770,
-- return -7618 vs -7609, flow -2166 vs -2161 (all +0.1..0.2%, = consolidated completeness).
-- Downstream matviews unchanged in shape: REFRESH mv_foreign_fund_flows, mv_foreign_returns_flows_summary.
--
-- After this, bbg_returns_foreign is read ONLY by v_module_freshness (Step 4), and the SP foreign
-- chain (v_sp_emisor_extranjero -> v_sp_foreign_classified -> v_sp_foreign_pdf) is orphan -> dropped.

CREATE OR REPLACE VIEW v_foreign_returns_flows AS
WITH pos AS (
  SELECT fecha_reporte, isin,
    max(pdf_bucket) AS pdf_bucket, max(pdf_em_dm) AS pdf_em_dm,
    max(pdf_subregion::text) AS pdf_subregion, max(pdf_fi_category::text) AS pdf_fi_category,
    max(pdf_bucket_nt) AS pdf_bucket_nt, max(pdf_em_dm_nt) AS pdf_em_dm_nt,
    max(pdf_subregion_nt) AS pdf_subregion_nt, max(pdf_fi_category_nt) AS pdf_fi_category_nt,
    sum(monto_dolares) AS pos_usd
  FROM v_consolidated_foreign_pdf
  WHERE pdf_bucket = ANY (ARRAY['Equity','Fixed Income','Private Equity'])
  GROUP BY fecha_reporte, isin
),
fechas AS (SELECT DISTINCT fecha_reporte FROM pos),
pares AS (
  SELECT f.fecha_reporte, date_trunc('month', f.fecha_reporte::timestamptz)::date - 1 AS fecha_prev
  FROM fechas f
  WHERE (date_trunc('month', f.fecha_reporte::timestamptz)::date - 1 IN (SELECT fecha_reporte FROM fechas))
    AND (f.fecha_reporte IN (SELECT DISTINCT end_date FROM bbg_returns))
),
ids AS (
  SELECT p.fecha_reporte, p.fecha_prev, i.isin
  FROM pares p
  CROSS JOIN LATERAL (
    SELECT pos.isin FROM pos WHERE pos.fecha_reporte = p.fecha_reporte
    UNION SELECT pos.isin FROM pos WHERE pos.fecha_reporte = p.fecha_prev
  ) i
)
SELECT ids.fecha_reporte, ids.isin,
  COALESCE(c.pdf_bucket, a.pdf_bucket) AS pdf_bucket,
  COALESCE(c.pdf_em_dm, a.pdf_em_dm) AS pdf_em_dm,
  COALESCE(c.pdf_subregion, a.pdf_subregion) AS pdf_subregion,
  COALESCE(c.pdf_fi_category, a.pdf_fi_category) AS pdf_fi_category,
  COALESCE(c.pdf_bucket_nt, a.pdf_bucket_nt) AS pdf_bucket_nt,
  COALESCE(c.pdf_em_dm_nt, a.pdf_em_dm_nt) AS pdf_em_dm_nt,
  COALESCE(c.pdf_subregion_nt, a.pdf_subregion_nt) AS pdf_subregion_nt,
  COALESCE(c.pdf_fi_category_nt, a.pdf_fi_category_nt) AS pdf_fi_category_nt,
  COALESCE(c.pos_usd, 0::numeric) AS pos_usd,
  COALESCE(a.pos_usd, 0::numeric) AS pos_prev_usd,
  COALESCE(c.pos_usd, 0::numeric) - COALESCE(a.pos_usd, 0::numeric) AS change_usd_mm,
  CASE WHEN c.isin IS NOT NULL AND a.isin IS NOT NULL
       THEN a.pos_usd::double precision * COALESCE(r.usd_ret, 0::double precision) / 100.0::double precision
       ELSE 0::double precision END AS return_usd_mm,
  (COALESCE(c.pos_usd, 0::numeric) - COALESCE(a.pos_usd, 0::numeric))::double precision -
  CASE WHEN c.isin IS NOT NULL AND a.isin IS NOT NULL
       THEN a.pos_usd::double precision * COALESCE(r.usd_ret, 0::double precision) / 100.0::double precision
       ELSE 0::double precision END AS flow_usd_mm
FROM ids
LEFT JOIN pos c ON c.fecha_reporte = ids.fecha_reporte AND c.isin = ids.isin
LEFT JOIN pos a ON a.fecha_reporte = ids.fecha_prev AND a.isin = ids.isin
LEFT JOIN bbg_returns r ON r.end_date = ids.fecha_reporte AND upper(r.nemo_sp) = upper(ids.isin);

REFRESH MATERIALIZED VIEW mv_foreign_fund_flows;
REFRESH MATERIALIZED VIEW mv_foreign_returns_flows_summary;

DROP VIEW IF EXISTS v_sp_foreign_pdf;
DROP VIEW IF EXISTS v_sp_foreign_classified;
DROP VIEW IF EXISTS v_sp_emisor_extranjero;
