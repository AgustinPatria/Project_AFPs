-- ============================================================================
-- Fase 2 · Switch de Alternatives al modelo SQL fuente unica
-- Aplicado a Supabase 2026-06-25 (migration fase2_switch_v_chist_aa_to_sql). Versionado aqui.
--
-- v_chist_aa se reescribe para leer de v_chist_classified (chist_adjusted) en vez
-- de historial_carteras_full + dim_valorizacion_remanente + dim_tipo_instrumento_filtro.
-- Los 8 consumidores (v_nav, v_uncalled, v_total, v_total_c1, v_afp_c1, v_afp_c2,
-- v_nav_c1, v_uncalled_c1) NO se tocan: heredan el cambio.
--
-- Esquema/tipos preservados EXACTO (casts a varchar(N)/numeric(p,s)) para que el
-- CREATE OR REPLACE no falle y los consumidores sigan validos.
--
-- DIFERENCIA INTENCIONAL vs la version legacy (mas correcta, diverge del PDF +1,6% NAV):
--   - clasificacion NAV = tipo_valor 'Valorizacion'; Remanente = uncalled (ya en la tabla,
--     reemplaza dim_valorizacion_remanente).
--   - Alternativos = is_alternative (Asset_Class='Alternative' del fondo O supracategory
--     'Direct Inv. Alternativos'), NO el filtro legacy por tipo de instrumento (filtro1).
--   - Recupera el fondo "Pearl Diver" (instrumento CMED, filtro1='No') y la inv. directa
--     alternativa que el legacy excluia. Ver memoria reference_pearl_diver_gap.
-- ============================================================================
CREATE OR REPLACE VIEW public.v_chist_aa AS
SELECT ca.fecha_reporte::date                                                           AS fecha,
       ca.fecha::date                                                                   AS fecha_snapshot,
       ca.afp::varchar(50)                                                              AS afp,
       ca.tipo_de_fondo::varchar(10)                                                    AS tipo_de_fondo,
       ca.tipo_de_instrumento::varchar(20)                                              AS tipo_de_instrumento,
       ca.nemotecnico::varchar(100)                                                     AS nemotecnico_del_instrumento,
       ca.nemotecnico::varchar                                                          AS nuevo_nemo,
       ca.nombre_del_emisor::varchar(255)                                               AS nombre_del_emisor,
       ca.inversion::numeric(30,4)                                                      AS inversion,
       (CASE WHEN ca.tipo_valor = 'Remanente' THEN 'Remanente' ELSE 'NAV' END)::varchar(50) AS clasificacion,
       ca.fund_id::varchar(50)                                                          AS fund_id,
       ca.fondo::varchar(255)                                                           AS fondo,
       ca.manager::varchar(100)                                                         AS manager,
       ca.region::varchar(50)                                                           AS region,
       ca.category::varchar(50)                                                         AS category,
       ca.alt_fund_type::varchar(50)                                                    AS alt_fund_type,
       ca.alt_strategy::varchar(100)                                                    AS alt_strategy,
       (CASE WHEN ca.region = 'Chile' THEN 'Local' ELSE ca.category END)::varchar       AS c1,
       fx.valor::numeric(20,6)                                                          AS valor_tipo_cambio,
       (ca.inversion / NULLIF(fx.valor, 0::numeric) / 1000000.0)::numeric               AS inversion_usd_mm
FROM public.v_chist_classified ca
LEFT JOIN public.tipo_cambio fx
       ON fx.fecha = ca.fecha_reporte
      AND fx.instrumento_codigo::text = 'CLFXDOOB_sindesf'::text
WHERE ca.is_alternative;
