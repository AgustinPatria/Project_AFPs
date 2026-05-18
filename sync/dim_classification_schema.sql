-- ============================================================================
-- Schema para sync de tablas de clasificacion desde SQL Server.
-- Origen: Inteligencia_Mercado.dbo.DIM_BD_*
--
-- Estas tablas alimentan los joins de clasificacion sobre v_sp_*: Manager,
-- Asset_Class, Category, Region, Strategy (via Family / Supra), y direct
-- investments. Mantienen la nomenclatura Patria — la fuente de verdad sigue
-- siendo SQL Server, esto es un sync read-only.
--
-- La 8va tabla (`dim_bd_funds`) ya existe en Supabase pero esta filtrada a
-- Asset_Class='Alternative'. El sync se va a actualizar para sacar ese filtro
-- y traer las ~4,500 filas completas.
-- ============================================================================

-- Lookup tables (small, full reload)
CREATE TABLE IF NOT EXISTS dim_bd_asset_class (
    id_asset_class  INT PRIMARY KEY,
    asset_class     TEXT
);

CREATE TABLE IF NOT EXISTS dim_bd_category (
    id_category     INT PRIMARY KEY,
    category        TEXT
);

CREATE TABLE IF NOT EXISTS dim_bd_region (
    id_region       INT PRIMARY KEY,
    region          TEXT
);

-- Strategy = Asset_Class x Region x Category (el bucket de la sec 04 del reporte)
CREATE TABLE IF NOT EXISTS dim_bd_ac_reg_cat (
    supra_id        INT PRIMARY KEY,
    asset_class     TEXT,
    region          TEXT,
    category        TEXT
);

-- Familias core de Moneda (Latam HY, EM LC, Latam Eq, Latam LC)
CREATE TABLE IF NOT EXISTS dim_bd_family (
    family_id          INT PRIMARY KEY,
    family_name        TEXT,
    family_short_name  TEXT
);

-- Mapeo Moneda product + peers competidores por familia
CREATE TABLE IF NOT EXISTS dim_bd_family_comp (
    family_id        INT NOT NULL,
    id               INT NOT NULL,
    tipo             TEXT,        -- 'Moneda' | 'Peer Group'
    fund_short_name  TEXT,
    PRIMARY KEY (family_id, id)
);

-- Direct investments (sovereign bonds, etc.) con NEMO
CREATE TABLE IF NOT EXISTS dim_bd_direct_inv_lics (
    nemo            TEXT PRIMARY KEY,
    asset_class     TEXT,
    region          TEXT,
    name            TEXT
);

-- Indices por columnas de filtro frecuente
CREATE INDEX IF NOT EXISTS idx_dim_bd_family_comp_id    ON dim_bd_family_comp (id);
CREATE INDEX IF NOT EXISTS idx_dim_bd_family_comp_tipo  ON dim_bd_family_comp (tipo);

COMMENT ON TABLE dim_bd_asset_class IS
    'Lookup de Asset_Class (9 valores). Fuente: Inteligencia_Mercado.dbo.DIM_BD_Asset_Class';
COMMENT ON TABLE dim_bd_category IS
    'Lookup de Category (20 valores). Fuente: DIM_BD_Category';
COMMENT ON TABLE dim_bd_region IS
    'Lookup de Region (12 valores). Fuente: DIM_BD_Region';
COMMENT ON TABLE dim_bd_ac_reg_cat IS
    'Cross de Asset_Class x Region x Category con Supra_ID (la "estrategia" de la sec 04 del reporte). Fuente: DIM_BD_AC_Reg_Cat';
COMMENT ON TABLE dim_bd_family IS
    'Las 4 familias / estrategias core de Moneda. Fuente: DIM_BD_Family';
COMMENT ON TABLE dim_bd_family_comp IS
    'Mapeo Moneda product + peers competidores por familia (alimenta sec 04). Fuente: DIM_BD_Family_Comp';
COMMENT ON TABLE dim_bd_direct_inv_lics IS
    'Direct investments con NEMO + Asset_Class + Region. Fuente: DIM_BD_Direct_Inv_LICS';
