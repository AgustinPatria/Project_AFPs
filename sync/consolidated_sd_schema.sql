-- ============================================================================
-- consolidated_sd  (Supabase mirror)
-- Fuente: Inteligencia_Mercado.dbo.AFP_CL_09_17_25_sd_consolidated
--
-- Detalle de cartera SIN desfase a nivel SISTEMA (no por AFP):
--   fecha x tipo_fondo (A-E) x nemotecnico.
-- Trae monto (USD MM) y limites nacional/extranjero (alimenta el cubo Limits).
-- `source` = cuadro SP de origen: 09/17 = nacional, 25 = extranjero, 17+25 = ambos.
-- Historia completa (2012-05 ->); tabla chica (~45 MB), no se ventanea.
-- Carga idempotente: DELETE por fecha presente en el pull + INSERT (ver sync_consolidated_sd.py).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.consolidated_sd (
    fila_id        BIGSERIAL PRIMARY KEY,
    fecha          DATE NOT NULL,
    tipo_fondo     TEXT NOT NULL,
    nemotecnico    TEXT NOT NULL,
    source         TEXT,
    lim_nac_usdmm  NUMERIC,
    lim_extr_usdmm NUMERIC,
    monto_usdmm    NUMERIC
);

CREATE INDEX IF NOT EXISTS ix_consolidated_sd_fecha ON public.consolidated_sd (fecha);
CREATE INDEX IF NOT EXISTS ix_consolidated_sd_nemo  ON public.consolidated_sd (nemotecnico);
