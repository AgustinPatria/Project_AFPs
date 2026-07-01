-- ============================================================================
-- v_afp_multifondo  (Supabase)
-- Aplicado a ProjectAFP_v2 (vmehawqqhcyhxyaoznpc) — migration create_v_afp_multifondo.
--
-- Desglose de alternativos por (fecha, afp, tipo_de_fondo / multifondo A-E),
-- pivotando clasificacion -> NAV / Uncalled (Remanente) / Total. Alimenta el
-- detalle expandible por multifondo del Summary AFP del home (tarea 3.3).
--
-- Lee de mv_chist_aa (no de v_chist_aa) para heredar el fix de timeout 57014 y
-- agregar ~4.840 filas/fecha a 40 (8 AFP x 5 multifondo), por debajo del limite
-- de 1.000 filas del REST. El AUM por multifondo NO va aqui: se calcula en la
-- capa web desde valores_cuota_patrimonio + tipo_cambio (40 filas/fecha).
--
-- Se refresca solo (es una vista sobre el matview): mv_chist_aa lo refresca
-- refresh_alternatives_matviews() tras cada sync. Esta vista no necesita refresh.
-- ============================================================================
CREATE OR REPLACE VIEW public.v_afp_multifondo AS
SELECT fecha, afp, tipo_de_fondo,
  sum(inversion_usd_mm)                                            AS total_usd_mm,
  sum(inversion_usd_mm) FILTER (WHERE clasificacion = 'NAV')       AS nav_usd_mm,
  sum(inversion_usd_mm) FILTER (WHERE clasificacion = 'Remanente') AS uncalled_usd_mm
FROM public.mv_chist_aa
GROUP BY fecha, afp, tipo_de_fondo;
