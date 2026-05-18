-- ============================================================================
-- Vistas sobre las tablas SP XML (sp_fila + sp_valor_*).
--
-- Las vistas exponen la columna `es_subtotal` pero NO filtran por defecto.
-- Razon: el flag heuristico marca como subtotal varias filas que en realidad
-- son grandes totales del cuadro y son data util (TOTAL ACTIVOS, TOTAL
-- GENERAL, TOTAL INVERSION EN EL EXTRANJERO). Filtrarlas oculta data
-- importante para el dashboard. Es responsabilidad de la query filtrar
-- (ej. WHERE NOT es_subtotal) cuando se hagan agregaciones que sumarian
-- doble los subtotales reales (TOTAL ACCIONES X, TOTAL MONTO MM$, etc.).
-- ============================================================================

-- DROP necesario antes de re-crear porque CREATE OR REPLACE no permite
-- cambiar el orden ni agregar columnas en el medio.
DROP VIEW IF EXISTS v_sp_cartera_fondo;
DROP VIEW IF EXISTS v_sp_cartera_afp;
DROP VIEW IF EXISTS v_sp_emisor_nacional;
DROP VIEW IF EXISTS v_sp_fi_local;
DROP VIEW IF EXISTS v_sp_extranjero_grupo;
DROP VIEW IF EXISTS v_sp_emisor_extranjero;

-- ----------------------------------------------------------------------------
-- Cuadro 1: Cartera por tipo de fondo (KPIs principales del sistema)
-- Filas tipicas: INVERSION NACIONAL TOTAL, RENTA VARIABLE, RENTA FIJA,
-- Activos Alternativos (5/7/8), DERIVADOS, TOTAL ACTIVOS.
-- ----------------------------------------------------------------------------
CREATE VIEW v_sp_cartera_fondo AS
SELECT
    f.periodo,
    f.fecha_valor,
    f.fila_numero,
    f.glosa,
    f.es_subtotal,
    v.tipo_fondo,                  -- 'A'..'E' | 'TOTAL'
    v.monto_dolares,
    v.porcentaje
FROM sp_fila f
JOIN sp_valor_fondo v USING (fila_id)
WHERE f.cuadro = 1;

-- ----------------------------------------------------------------------------
-- Cuadro 2: Cartera por AFP × tipo de fondo
-- Sub-listado: 'A'..'E' (uno por tipo de fondo) y 'TOTAL' (sistema).
-- ----------------------------------------------------------------------------
CREATE VIEW v_sp_cartera_afp AS
SELECT
    f.periodo,
    f.fecha_valor,
    f.sub_listado_codigo AS tipo_fondo,   -- 'A'..'E' | 'TOTAL'
    f.fila_numero,
    f.glosa,
    f.es_subtotal,
    v.afp_nombre,                          -- 'CAPITAL'..'UNO' | 'TOTAL'
    v.afp_rut,
    v.monto_dolares,
    v.porcentaje
FROM sp_fila f
JOIN sp_valor_afp v USING (fila_id)
WHERE f.cuadro = 2;

-- ----------------------------------------------------------------------------
-- Cuadro 8: Cartera nacional por emisor × instrumento
-- ----------------------------------------------------------------------------
CREATE VIEW v_sp_emisor_nacional AS
SELECT
    f.periodo,
    f.fecha_valor,
    f.sub_listado_codigo AS tipo_fondo,    -- 'A'..'E' | 'TOTAL'
    f.tipo_institucion,                     -- 'estatal' | 'financiera' | 'empresa' | 'fi_fm' | 'activos_alternativos_nacionales'
    f.fila_numero,
    f.glosa AS emisor,
    f.es_subtotal,
    v.instrumento_glosa,                    -- 'BCU', 'BTP', 'BTU', etc. | 'TOTAL'
    v.porcentaje,
    v.monto_pesos,
    v.monto_dolares
FROM sp_fila f
JOIN sp_valor_instrumento v USING (fila_id)
WHERE f.cuadro = 8;

-- ----------------------------------------------------------------------------
-- Cuadro 17: FI/FM nacionales por nemotecnia × tipo de fondo
-- Cruce nemo-por-nemo contra v_nav_c1.Local de CHIST.
-- ----------------------------------------------------------------------------
CREATE VIEW v_sp_fi_local AS
SELECT
    f.periodo,
    f.fecha_valor,
    f.fila_numero,
    f.glosa AS fondo,
    f.nemotecnico,
    f.condicion,                            -- 'E' (Elegible) | 'R' (Restringido)
    f.es_subtotal,
    v.tipo_fondo,                           -- 'A'..'E' | 'TOTAL'
    v.monto_dolares,
    v.porcentaje,
    v.porcentaje_sobre_emisor
FROM sp_fila f
JOIN sp_valor_fondo v USING (fila_id)
WHERE f.cuadro = 17;

-- ----------------------------------------------------------------------------
-- Cuadro 18: Inversion extranjera por grupo de emisores (def. amplia para alt)
-- ----------------------------------------------------------------------------
CREATE VIEW v_sp_extranjero_grupo AS
SELECT
    f.periodo,
    f.fecha_valor,
    f.fila_numero,
    f.glosa,
    f.es_subtotal,
    v.tipo_fondo,                           -- 'A'..'E' | 'TOTAL'
    v.monto_dolares,
    v.porcentaje,
    v.porcentaje_sobre_extranjero
FROM sp_fila f
JOIN sp_valor_fondo v USING (fila_id)
WHERE f.cuadro = 18;

-- ----------------------------------------------------------------------------
-- Cuadro 25: Cartera extranjera por emisor (ISIN-level)
-- ----------------------------------------------------------------------------
CREATE VIEW v_sp_emisor_extranjero AS
SELECT
    f.periodo,
    f.fecha_valor,
    f.fila_numero,
    f.glosa AS emisor,
    f.nemotecnico AS isin,
    f.es_subtotal,
    v.tipo_fondo,                           -- 'A'..'E' | 'TOTAL'
    v.monto_dolares,
    v.porcentaje
FROM sp_fila f
JOIN sp_valor_fondo v USING (fila_id)
WHERE f.cuadro = 25;
