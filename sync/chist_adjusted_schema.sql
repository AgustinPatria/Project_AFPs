-- ============================================================================
-- chist_adjusted  (Supabase mirror)
-- Fuente: Inteligencia_Mercado.dbo.AFP_CL_CHIST_ADJUSTED  (18,7M filas)
--
-- Detalle de cartera CON desfase, POR AFP x instrumento, ya pre-clasificado en
-- `supracategory`. Unico nivel con detalle por-AFP. `tipo_valor`:
--   Valorizacion = NAV ; Remanente = uncalled (solo bajo Fondos).
--
-- Ventana 2025+ y filtro de buckets para caber en free tier (~37 MB, ~150k filas):
--   se EXCLUYE: Direct Inv. RF Nacional, Derivados Nacional, Derivados Extranjero,
--   Disponible Nacional (sus totales salen de los agregados sd_asset_class_*).
-- Columnas forward/swap NO se traen (no se muestran).
-- Carga idempotente: DELETE por fecha presente en el pull + INSERT.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chist_adjusted (
    fila_id                 BIGSERIAL PRIMARY KEY,
    fecha_reporte           DATE,
    fecha                   DATE NOT NULL,
    afp                     TEXT,
    tipo_de_fondo           TEXT,
    tipo_de_instrumento     TEXT,
    nemotecnico             TEXT,
    nombre_del_emisor       TEXT,
    nacionalidad_del_emisor TEXT,
    unidades                BIGINT,
    precio                  DOUBLE PRECISION,
    inversion               DOUBLE PRECISION,
    supracategory           TEXT,
    tipo_valor              TEXT
);

CREATE INDEX IF NOT EXISTS ix_chist_adjusted_fecha ON public.chist_adjusted (fecha);
CREATE INDEX IF NOT EXISTS ix_chist_adjusted_supra ON public.chist_adjusted (supracategory);
CREATE INDEX IF NOT EXISTS ix_chist_adjusted_nemo  ON public.chist_adjusted (nemotecnico);
