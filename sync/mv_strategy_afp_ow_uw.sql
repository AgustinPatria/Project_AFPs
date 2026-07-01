-- Ajustes_Dashboard 1.4 — per-AFP positioning in our (Moneda) funds, with
-- over/underweight vs the system average. Strategy section, lagged world (CHIST).
-- Migration: strategy_afp_ow_uw_matview (ProjectAFP_v2 vmehawqqhcyhxyaoznpc).
--
-- "Our funds" = dim_bd_family_comp rows with tipo='Moneda' (the Peer Group rows are
-- competitors, excluded). Per (fecha, family, afp):
--   our_usd_mm = USD that AFP holds in the family's Moneda funds (v_chist_classified × FX)
--   weight     = our_usd_mm / that AFP's total AUM (v_aum)
--   sys_avg    = sum(our_usd_mm) / sum(AFP AUM) across all AFPs (system weight)
--   ow_uw      = weight - sys_avg  (positive = overweight our funds vs the system)
-- AFPs that hold none of the family's Moneda funds appear with weight 0 (fully UW).
-- Materialized (reads heavy v_chist_classified); refreshed by refresh_alternatives_matviews().

CREATE MATERIALIZED VIEW mv_strategy_afp_ow_uw AS
WITH moneda AS (
  SELECT DISTINCT family_id, id::text AS fund_id
  FROM dim_bd_family_comp
  WHERE tipo = 'Moneda'
),
holdings AS (
  SELECT c.fecha_reporte, m.family_id, c.afp,
         sum(c.inversion / NULLIF(fx.valor, 0) / 1000000.0) AS our_usd_mm
  FROM v_chist_classified c
  JOIN moneda m ON m.fund_id = c.fund_id
  LEFT JOIN tipo_cambio fx
    ON fx.fecha = c.fecha_reporte
   AND fx.instrumento_codigo::text = 'CLFXDOOB_sindesf'::text
  GROUP BY c.fecha_reporte, m.family_id, c.afp
),
fam_fecha AS (
  SELECT DISTINCT fecha_reporte, family_id FROM holdings
),
base AS (
  SELECT ff.fecha_reporte, ff.family_id, a.afp,
         a.aum_usd_mm,
         COALESCE(h.our_usd_mm, 0) AS our_usd_mm
  FROM fam_fecha ff
  JOIN v_aum a ON a.fecha = ff.fecha_reporte
  LEFT JOIN holdings h
    ON h.fecha_reporte = ff.fecha_reporte
   AND h.family_id = ff.family_id
   AND h.afp = a.afp
),
sysavg AS (
  SELECT fecha_reporte, family_id,
         sum(our_usd_mm) / NULLIF(sum(aum_usd_mm), 0) AS sys_avg
  FROM base
  GROUP BY fecha_reporte, family_id
)
SELECT b.fecha_reporte,
       b.family_id,
       b.afp,
       b.our_usd_mm::numeric(20,4)                                   AS our_usd_mm,
       b.aum_usd_mm::numeric(20,4)                                   AS afp_aum_usd_mm,
       (b.our_usd_mm / NULLIF(b.aum_usd_mm, 0))::numeric             AS weight,
       s.sys_avg::numeric                                            AS sys_avg,
       (b.our_usd_mm / NULLIF(b.aum_usd_mm, 0) - s.sys_avg)::numeric AS ow_uw
FROM base b
JOIN sysavg s ON s.fecha_reporte = b.fecha_reporte AND s.family_id = b.family_id;

CREATE INDEX ix_mv_strategy_afp_ow_uw_family_fecha
  ON mv_strategy_afp_ow_uw (family_id, fecha_reporte);

-- Folded into the shared refresh RPC (see sync/mv_alternatives_materialize.sql):
--   CREATE OR REPLACE FUNCTION public.refresh_alternatives_matviews() ... now also does
--   REFRESH MATERIALIZED VIEW public.mv_strategy_afp_ow_uw;
