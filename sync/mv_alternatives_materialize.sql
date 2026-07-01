-- Materialize the Alternatives home-page base to fix Postgres 57014 (statement_timeout)
-- on cold loads. The home fired ~10 view queries in parallel, each recomputing the
-- v_chist_aa chain (dim_homol_funds windowed dedup + per-row dim_bd_funds join +
-- chist_adjusted scan). getEvolution's full-history v_total alone was ~2.35s warm and
-- far worse cold, blowing past the 8s timeout.
--
-- Migrations (applied to ProjectAFP_v2 vmehawqqhcyhxyaoznpc):
--   1) materialize_alternatives_base_mv_chist_aa_mv_aum
--   2) refresh_alternatives_matviews_rpc
--
-- After: v_total full 2350ms -> 34ms (~70x), v_aum full 686ms -> 0.9ms (~700x).
-- Numbers reconcile exactly (Total 25,877 / NAV 15,654 / Uncalled 10,224 / AUM 252,183
-- @ 2026-01-31). Dashboard unchanged: the public view names (v_total/v_nav/v_uncalled/
-- v_aum/...) are preserved, only their FROM source swaps to the matview.

-- (1) mv_chist_aa: snapshot of the heavy alternatives base (~60k rows, monthly data).
CREATE MATERIALIZED VIEW mv_chist_aa AS SELECT * FROM v_chist_aa;
CREATE INDEX ix_mv_chist_aa_fecha_afp ON mv_chist_aa (fecha, afp);
CREATE INDEX ix_mv_chist_aa_fecha_clasif ON mv_chist_aa (fecha, clasificacion);

-- Repoint the 8 consumers from v_chist_aa -> mv_chist_aa (FROM swap only; columns/names
-- unchanged so the dashboard needs no changes). v_chist_aa stays as the source of truth
-- the matview snapshots on refresh.
CREATE OR REPLACE VIEW v_total AS
  SELECT fecha, afp, sum(inversion_usd_mm) AS total_usd_mm
  FROM mv_chist_aa GROUP BY fecha, afp;

CREATE OR REPLACE VIEW v_nav AS
  SELECT fecha, afp, sum(inversion_usd_mm) AS nav_usd_mm
  FROM mv_chist_aa WHERE clasificacion::text = 'NAV'::text GROUP BY fecha, afp;

CREATE OR REPLACE VIEW v_uncalled AS
  SELECT fecha, afp, sum(inversion_usd_mm) AS uncalled_usd_mm
  FROM mv_chist_aa WHERE clasificacion::text = 'Remanente'::text GROUP BY fecha, afp;

CREATE OR REPLACE VIEW v_afp_c1 AS
  SELECT fecha, afp, c1, sum(inversion_usd_mm) AS total_usd_mm
  FROM mv_chist_aa WHERE c1 IS NOT NULL GROUP BY fecha, afp, c1;

CREATE OR REPLACE VIEW v_afp_c2 AS
  SELECT fecha, afp,
    CASE WHEN region::text = 'Chile'::text THEN 'Local'::text ELSE 'Foreign'::text END AS region,
    category, alt_fund_type, alt_strategy,
    sum(inversion_usd_mm) AS total_usd_mm
  FROM mv_chist_aa
  GROUP BY fecha, afp,
    (CASE WHEN region::text = 'Chile'::text THEN 'Local'::text ELSE 'Foreign'::text END),
    category, alt_fund_type, alt_strategy;

CREATE OR REPLACE VIEW v_nav_c1 AS
  SELECT fecha, c1, sum(inversion_usd_mm) AS nav_usd_mm
  FROM mv_chist_aa WHERE clasificacion::text = 'NAV'::text AND c1 IS NOT NULL GROUP BY fecha, c1;

CREATE OR REPLACE VIEW v_total_c1 AS
  SELECT fecha, c1, sum(inversion_usd_mm) AS total_usd_mm
  FROM mv_chist_aa WHERE c1 IS NOT NULL GROUP BY fecha, c1;

CREATE OR REPLACE VIEW v_uncalled_c1 AS
  SELECT fecha, c1, sum(inversion_usd_mm) AS uncalled_usd_mm
  FROM mv_chist_aa WHERE clasificacion::text = 'Remanente'::text AND c1 IS NOT NULL GROUP BY fecha, c1;

-- mv_aum: snapshot of month-end AUM per AFP (~539 rows). The original view's non-sargable
-- month-end filter forced an 82k-row seq scan per request.
CREATE MATERIALIZED VIEW mv_aum AS
  SELECT v.fecha, v.afp,
    sum(v.valor_patrimonio / NULLIF(fx.valor, 0::numeric) / 1000000::numeric) AS aum_usd_mm
  FROM valores_cuota_patrimonio v
  JOIN tipo_cambio fx ON fx.fecha = v.fecha AND fx.instrumento_codigo::text = 'CLFXDOOB_sindesf'::text
  WHERE v.fecha = (date_trunc('month'::text, v.fecha::timestamp with time zone) + '1 mon'::interval - '1 day'::interval)::date
  GROUP BY v.fecha, v.afp;
CREATE INDEX ix_mv_aum_fecha_afp ON mv_aum (fecha, afp);

CREATE OR REPLACE VIEW v_aum AS
  SELECT fecha, afp, aum_usd_mm FROM mv_aum;

-- (2) Scoped refresh RPC (PostgREST can't run REFRESH; called by the sync scripts and
-- sync/refresh_mv.py). SECURITY DEFINER so service_role can refresh; timeout raised.
CREATE OR REPLACE FUNCTION public.refresh_alternatives_matviews()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_chist_aa;
  REFRESH MATERIALIZED VIEW public.mv_aum;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_alternatives_matviews() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_alternatives_matviews() TO service_role;
