-- ============================================================================
-- SP XML cartera_agregada — schema para datos agregados sin desfase
-- ============================================================================
-- La SP publica mensualmente cartera_agregada<YYYYMM>.xml con el sistema AFP
-- consolidado. 30 cuadros distintos. Cubre la "ventana" de los últimos 4 meses
-- mientras CHIST llega con desfase regulatorio.
--
-- Estructura: 1 cabecera (sp_fila) + 3 tablas de valores según la dimensión-
-- columna del cuadro (tipo_fondo / afp / instrumento).
--
-- Mapeo cuadro → tabla de valores:
--   sp_valor_fondo:         cuadros 1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 17,
--                           18, 20, 22, 24, 26, 27, 28, 29, 30
--   sp_valor_afp:           cuadros 2, 14, 15, 16, 19, 21, 23
--   sp_valor_instrumento:   cuadro 8 (pivot por instrumento)
--
-- Re-carga idempotente: DELETE FROM sp_fila WHERE periodo = '<YYYY-MM>'.
-- Las FK con ON DELETE CASCADE limpian las tablas de valores.
--
-- Ejecutar UNA VEZ en el SQL editor de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cabecera de cada <fila> del XML
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sp_fila (
    fila_id              BIGSERIAL PRIMARY KEY,

    -- Período / fechas
    periodo              TEXT NOT NULL,                  -- '2025-11' (encabezado)
    fecha_valor          DATE NOT NULL,                  -- 4to viernes del mes (subtitulo)
    fecha_publicacion    DATE,                           -- encabezado/fecha_publicacion

    -- Identificación del cuadro y la fila
    cuadro               SMALLINT NOT NULL CHECK (cuadro BETWEEN 1 AND 30),
    sub_listado_codigo   TEXT,                           -- 'A'..'E' o 'TOTAL' para cuadros con sub-listados por tipo de fondo (2, 14-16, 19, 21, 23)
    fila_numero          INT NOT NULL,
    glosa                TEXT NOT NULL,

    -- Atributos contenedores (vienen como atributos XML del wrapper, no de la fila)
    tipo_institucion     TEXT,                           -- cuadro 8: 'estatal'|'financiera'|'empresa'|'fi_fm'|'activos_alternativos_nacionales'
    moneda_objeto        TEXT,                           -- cuadros 27, 28
    agrupacion           TEXT,                           -- cuadros 27, 28: 'Forward', 'Swap'

    -- Atributos de fila (sub-elementos del <fila>)
    emisor               TEXT,                           -- cuadros 9, 10 (nombre completo del emisor; glosa es el nemo)
    nemotecnico          TEXT,                           -- cuadros 9, 17, 25
    tipo_accion          CHAR(1),                        -- cuadro 9: 'S' (Suficiente) | 'N' (No Suficiente)
    elegibilidad         CHAR(1),                        -- cuadro 9: 'E' (Elegible) | 'R' (Restringida)
    condicion            CHAR(1),                        -- cuadro 17: 'E' | 'R'
    unidad_indexada      TEXT,                           -- cuadros 29, 30: 'NO' | 'US$' | 'UF'

    -- Filas que no son data sino totales/subtotales del cuadro
    -- ej. 'TOTAL ACCIONES ELECTRICO', 'TOTAL PORCENTAJE', 'TOTAL MONTO MM$'
    es_subtotal          BOOLEAN NOT NULL DEFAULT FALSE,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_fila_periodo          ON sp_fila (periodo);
CREATE INDEX IF NOT EXISTS idx_sp_fila_cuadro_periodo   ON sp_fila (cuadro, periodo);
CREATE INDEX IF NOT EXISTS idx_sp_fila_cuadro_glosa     ON sp_fila (cuadro, glosa);
CREATE INDEX IF NOT EXISTS idx_sp_fila_nemotecnico      ON sp_fila (nemotecnico) WHERE nemotecnico IS NOT NULL;

COMMENT ON TABLE sp_fila IS 'Cabecera de cada <fila> del XML cartera_agregada<YYYYMM>.xml de la SP.';

-- ----------------------------------------------------------------------------
-- 2. Valores por tipo de fondo (cuadros con <tipofondo codigo="A..E"> + <total>)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sp_valor_fondo (
    fila_id                       BIGINT NOT NULL REFERENCES sp_fila(fila_id) ON DELETE CASCADE,
    tipo_fondo                    TEXT NOT NULL CHECK (tipo_fondo IN ('A','B','C','D','E','TOTAL')),

    monto_dolares                 NUMERIC(20,4),
    monto_pesos                   NUMERIC(20,2),         -- cuadros 3, 8 reportan también en MM$
    porcentaje                    NUMERIC(10,4),
    porcentaje_sobre_emisor       NUMERIC(10,4),         -- cuadros 9, 17
    porcentaje_sobre_extranjero   NUMERIC(10,4),         -- cuadros 18, 20, 22, 25

    PRIMARY KEY (fila_id, tipo_fondo)
);

COMMENT ON TABLE sp_valor_fondo IS 'Valores por tipo de fondo. tipo_fondo=''TOTAL'' representa el <total> agregado de la fila.';

-- ----------------------------------------------------------------------------
-- 3. Valores por AFP (cuadros 2, 14-16, 19, 21, 23)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sp_valor_afp (
    fila_id              BIGINT NOT NULL REFERENCES sp_fila(fila_id) ON DELETE CASCADE,

    -- 'TOTAL' para la columna <total> agregada de la fila; sino RUT formato 'numero-dv'
    afp_rut              TEXT NOT NULL,
    afp_nombre           TEXT NOT NULL,                  -- 'CAPITAL', 'CUPRUM', 'HABITAT', 'MODELO', 'PLANVITAL', 'PROVIDA', 'UNO', 'TOTAL'

    monto_dolares        NUMERIC(20,4),
    porcentaje           NUMERIC(10,4),

    PRIMARY KEY (fila_id, afp_rut)
);

CREATE INDEX IF NOT EXISTS idx_sp_valor_afp_nombre ON sp_valor_afp (afp_nombre);

COMMENT ON TABLE sp_valor_afp IS 'Valores por AFP. En cuadros 2, 14-16, 19, 21, 23 el sub-listado de la fila va en sp_fila.sub_listado_codigo (A/B/C/D/E/TOTAL).';

-- ----------------------------------------------------------------------------
-- 4. Valores por instrumento (cuadro 8 — pivot raro: instrumentos como columnas)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sp_valor_instrumento (
    fila_id              BIGINT NOT NULL REFERENCES sp_fila(fila_id) ON DELETE CASCADE,
    instrumento_glosa    TEXT NOT NULL,                  -- 'BCU', 'BTP', 'BTU', 'BVL', 'PDC', etc.

    porcentaje           NUMERIC(10,4),
    monto_pesos          NUMERIC(20,2),
    monto_dolares        NUMERIC(20,4),

    PRIMARY KEY (fila_id, instrumento_glosa)
);

COMMENT ON TABLE sp_valor_instrumento IS 'Valores por instrumento del cuadro 8 (cartera nacional por emisor x instrumento). Cada emisor (sp_fila.glosa) tiene N filas, una por instrumento.';
