-- ============================================================================
-- dim_bd_previa  (Supabase mirror)
-- Fuente: Inteligencia_Mercado.dbo.DIM_BD_Previa_AFPCL
--
-- Separador nemo -> Type {FUND, DIRECT_INV}. Se usa para clasificar el detalle
-- de consolidated_sd (fondo vs inversion directa) antes de cruzar con las dims
-- de fondos (HOMOL/BD_FUNDS) o de instrumentos (BD_Instrumentos).
-- La fuente tiene 9 filas duplicadas exactas (mismo nemo+Type) -> se cargan con
-- SELECT DISTINCT, por eso `nemo` puede ser PK (2.667 unicos).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dim_bd_previa (
    nemo TEXT PRIMARY KEY,
    type TEXT NOT NULL
);
