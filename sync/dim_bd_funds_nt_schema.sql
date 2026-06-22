-- ============================================================================
-- Nueva taxonomia de fondos (BD_Funds.xlsx) sobre dim_bd_funds.
--
-- BD_Funds.xlsx es una RE-clasificacion del mismo universo de fondos que ya
-- vive en dim_bd_funds (~4,962 filas, match 1:1 por nombre+manager). Aporta
-- dos niveles nuevos de jerarquia (Sub Asset Class, Sub-Category) y revisa las
-- etiquetas de Asset Class / Category / Region.
--
-- Decision (2026-06-09): se AGREGAN como columnas nuevas con prefijo `nt_`
-- (nueva taxonomia) en vez de sobreescribir asset_class/category/region. Las
-- columnas legacy siguen alimentando las 8 vistas afinadas al PDF
-- (v_chist_foreign_classified, v_sp_strategy_aum, v_chist_aa, etc.); el
-- dashboard puede adoptar la nueva taxonomia gradualmente via las columnas nt_.
--
-- Mantenida a mano en Supabase (patron dim_valorizacion_remanente): NO la
-- regenera el sync desde SQL Server. Recargar con sync/load_bd_funds_nt.py
-- cuando llegue un Excel nuevo.
-- ============================================================================

ALTER TABLE dim_bd_funds ADD COLUMN IF NOT EXISTS nt_asset_class      TEXT;
ALTER TABLE dim_bd_funds ADD COLUMN IF NOT EXISTS nt_sub_asset_class  TEXT;
ALTER TABLE dim_bd_funds ADD COLUMN IF NOT EXISTS nt_category         TEXT;
ALTER TABLE dim_bd_funds ADD COLUMN IF NOT EXISTS nt_sub_category     TEXT;
ALTER TABLE dim_bd_funds ADD COLUMN IF NOT EXISTS nt_region           TEXT;

COMMENT ON COLUMN dim_bd_funds.nt_asset_class IS
    'Nueva taxonomia (BD_Funds.xlsx): Asset Class. 5 valores. Cargado a mano via load_bd_funds_nt.py.';
COMMENT ON COLUMN dim_bd_funds.nt_sub_asset_class IS
    'Nueva taxonomia (BD_Funds.xlsx): Sub Asset Class (nivel nuevo, no existe en taxonomia legacy). 11 valores.';
COMMENT ON COLUMN dim_bd_funds.nt_category IS
    'Nueva taxonomia (BD_Funds.xlsx): Category. 17 valores.';
COMMENT ON COLUMN dim_bd_funds.nt_sub_category IS
    'Nueva taxonomia (BD_Funds.xlsx): Sub-Category (nivel nuevo). 30 valores.';
COMMENT ON COLUMN dim_bd_funds.nt_region IS
    'Nueva taxonomia (BD_Funds.xlsx): Region. 14 valores.';
