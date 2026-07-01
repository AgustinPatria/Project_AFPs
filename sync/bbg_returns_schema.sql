-- ============================================================================
-- bbg_returns  (Supabase mirror)
-- Fuente: Inteligencia_Mercado.dbo.AFP_CL_BBG_Returns
--
-- Retorno mensual USD por fondo (Nemo_SP), desde Bloomberg. Solo fondos NO
-- alternativos. Reemplaza a bbg_returns_foreign (que venia de Excel y solo foreign).
-- Historia completa (2021-06 ->); tabla chica (~3 MB).
-- Carga idempotente: DELETE por end_date presente en el pull + INSERT.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bbg_returns (
    fila_id      BIGSERIAL PRIMARY KEY,
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    nemo_sp      TEXT NOT NULL,
    isin_ticker  TEXT,
    usd_ret      DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_bbg_returns_end   ON public.bbg_returns (end_date);
CREATE INDEX IF NOT EXISTS ix_bbg_returns_nemo  ON public.bbg_returns (nemo_sp);
