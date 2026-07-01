-- ============================================================================
-- Fase 1 · Capa de clasificacion (modelo SQL fuente unica)
-- Aplicado a Supabase 2026-06-25 via apply_migration. Versionado aqui.
--
-- v_fund_class       : nemo -> atributos de fondo (BD_FUNDS), deduplicado por
--                      prioridad de Source en HOMOL. Reutilizable.
-- v_chist_classified : detalle CON desfase (chist_adjusted) ya clasificado, con
--                      flag is_alternative + atributos de fondo. Base de
--                      Alternatives / Foreign Managers / Distributors / Strategy.
-- ============================================================================

-- nemo -> fondo (1 fila por nemo, source AFP_CL > LICS_CL > CARTERAS_FM_CMF > RUT_CMF > resto)
CREATE OR REPLACE VIEW public.v_fund_class AS
SELECT h.nemo,
       bf.id          AS fund_id,
       bf.fondo,
       bf.manager,
       bf.asset_class,
       bf.category,
       bf.region,
       bf.alt_fund_type,
       bf.alt_strategy,
       bf.nt_asset_class,
       bf.nt_sub_asset_class,
       bf.nt_category,
       bf.nt_sub_category,
       bf.nt_region,
       (bf.asset_class = 'Alternative') AS is_alt_fund
FROM (
    SELECT name AS nemo, id,
           ROW_NUMBER() OVER (PARTITION BY name ORDER BY
             CASE source WHEN 'AFP_CL' THEN 1 WHEN 'LICS_CL' THEN 2
                         WHEN 'CARTERAS_FM_CMF' THEN 3 WHEN 'RUT_CMF' THEN 4
                         ELSE 5 END) AS rn
    FROM public.dim_homol_funds
) h
JOIN public.dim_bd_funds bf ON bf.id::text = h.id::text
WHERE h.rn = 1;

-- detalle CHIST clasificado (desfasado, por AFP)
CREATE OR REPLACE VIEW public.v_chist_classified AS
SELECT ca.fila_id, ca.fecha_reporte, ca.fecha, ca.afp,
       ca.tipo_de_fondo, ca.tipo_de_instrumento,
       ca.nemotecnico, ca.nombre_del_emisor, ca.nacionalidad_del_emisor,
       ca.unidades, ca.precio, ca.inversion,
       ca.supracategory, ca.tipo_valor,
       fc.fund_id, fc.manager, fc.asset_class, fc.category, fc.region,
       fc.alt_fund_type, fc.alt_strategy,
       fc.nt_asset_class, fc.nt_sub_asset_class, fc.nt_category,
       fc.nt_sub_category, fc.nt_region,
       -- alternativos: fondo con Asset_Class='Alternative' o el bucket Direct Inv. Alternativos
       (COALESCE(fc.is_alt_fund, false)
        OR ca.supracategory = 'Direct Inv. Alternativos') AS is_alternative,
       fc.fondo
FROM public.chist_adjusted ca
LEFT JOIN public.v_fund_class fc ON fc.nemo = ca.nemotecnico;

-- detalle consolidado clasificado (sin desfase, nivel sistema)
--   previa_type = FUND / DIRECT_INV (separador nemo)
--   funds -> atributos via v_fund_class ; DI -> se clasifica en las vistas de
--   seccion con BD_Instrumentos/GICS (Fase 2).
CREATE OR REPLACE VIEW public.v_consolidated_classified AS
SELECT cs.fila_id, cs.fecha, cs.tipo_fondo, cs.nemotecnico, cs.source,
       cs.lim_nac_usdmm, cs.lim_extr_usdmm, cs.monto_usdmm,
       p.type AS previa_type,
       fc.fund_id, fc.manager, fc.asset_class, fc.category, fc.region,
       fc.alt_fund_type, fc.alt_strategy,
       fc.nt_asset_class, fc.nt_sub_asset_class, fc.nt_category,
       fc.nt_sub_category, fc.nt_region,
       COALESCE(fc.is_alt_fund, false) AS is_alt_fund
FROM public.consolidated_sd cs
LEFT JOIN public.dim_bd_previa p  ON p.nemo  = cs.nemotecnico
LEFT JOIN public.v_fund_class  fc ON fc.nemo = cs.nemotecnico;
