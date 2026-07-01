-- ============================================================================
-- Fase 2 · Switch de Strategy (rama principal) al modelo SQL fuente unica
-- Aplicado a Supabase 2026-06-25 (migration fase2_switch_strategy_to_sql). Versionado aqui.
--
-- v_sp_strategy_aum se reescribe: AUM por fondo desde v_consolidated_classified
-- (consolidated_sd, Fondos a nivel sistema, SIN desfase) en vez de las vistas SP
-- (v_sp_fi_local + v_sp_emisor_extranjero). Reconciliado EXACTO vs SP (8 periodos,
-- diff +-1 por redondeo). Ahora fresco a 2026-05.
--
-- v_sp_strategy_aum era hoja (sin vistas dependientes) -> DROP+CREATE limpio.
-- PENDIENTE: rama family-11 (local equity, v_local_equity_di_vs_if_combined).
-- ============================================================================
DROP VIEW IF EXISTS public.v_sp_strategy_aum;

CREATE VIEW public.v_sp_strategy_aum AS
WITH fund_aum AS (
  SELECT cc.fund_id::integer        AS fund_id,
         to_char(cc.fecha, 'YYYY-MM') AS periodo,
         cc.fecha                   AS fecha_valor,
         SUM(cc.monto_usdmm)        AS monto_dolares
  FROM public.v_consolidated_classified cc
  WHERE cc.fund_id IS NOT NULL
  GROUP BY cc.fund_id, cc.fecha
)
SELECT fc.family_id, fam.family_name, fam.family_short_name,
       fc.tipo, fc.fund_short_name, bf.fondo AS fondo_largo, bf.manager,
       fa.periodo, fa.fecha_valor, fa.monto_dolares,
       round(100::numeric * fa.monto_dolares
             / NULLIF(sum(fa.monto_dolares) OVER (PARTITION BY fc.family_id, fa.periodo), 0::numeric), 2) AS market_share_pct
FROM public.dim_bd_family_comp fc
JOIN public.dim_bd_family fam ON fam.family_id = fc.family_id
LEFT JOIN public.dim_bd_funds bf ON bf.id::text = fc.id::text
LEFT JOIN fund_aum fa ON fa.fund_id = fc.id;
