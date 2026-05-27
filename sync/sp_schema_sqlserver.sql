-- ============================================================================
-- SP XML cartera_agregada + Cotizantes — schema para SQL Server (T-SQL)
-- DB destino: Inteligencia_Mercado.dbo
-- Tablas:
--   AFP_CL_SP_Fila              (cabecera de cada <fila> del XML)
--   AFP_CL_SP_Valor_Fondo       (valores por tipo_fondo A..E/TOTAL)
--   AFP_CL_SP_Valor_AFP         (valores por AFP)
--   AFP_CL_SP_Valor_Instrumento (cuadro 8: pivot por instrumento)
--   AFP_CL_SP_Cotizantes        (cotizantes mensuales por AFP)
--
-- Mapeo cuadro -> tabla de valores:
--   AFP_CL_SP_Valor_Fondo:        1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 17,
--                                 18, 20, 22, 24, 26, 27, 28, 29, 30
--   AFP_CL_SP_Valor_AFP:          2, 14, 15, 16, 19, 21, 23
--   AFP_CL_SP_Valor_Instrumento:  8
--
-- Re-carga idempotente: DELETE FROM AFP_CL_SP_Fila WHERE periodo = '<YYYY-MM>'.
-- FK con ON DELETE CASCADE limpian las tablas de valores.
-- ============================================================================

USE Inteligencia_Mercado;
GO

-- ----------------------------------------------------------------------------
-- 1. Cabecera de cada <fila> del XML
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AFP_CL_SP_Fila' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AFP_CL_SP_Fila (
        fila_id              BIGINT IDENTITY(1,1) NOT NULL,

        -- Periodo / fechas
        periodo              VARCHAR(7)   NOT NULL,            -- '2025-11'
        fecha_valor          DATE         NOT NULL,            -- 4to viernes del mes
        fecha_publicacion    DATE         NULL,                -- encabezado

        -- Identificacion del cuadro y la fila
        cuadro               SMALLINT     NOT NULL,
        sub_listado_codigo   VARCHAR(10)  NULL,                -- 'A'..'E' o 'TOTAL'
        fila_numero          INT          NOT NULL,
        glosa                NVARCHAR(500) NOT NULL,

        -- Atributos contenedores
        tipo_institucion     VARCHAR(50)  NULL,                -- cuadro 8
        moneda_objeto        VARCHAR(50)  NULL,                -- cuadros 27, 28
        agrupacion           VARCHAR(50)  NULL,                -- cuadros 27, 28

        -- Atributos de fila
        emisor               NVARCHAR(500) NULL,               -- cuadros 9, 10
        nemotecnico          NVARCHAR(100) NULL,               -- cuadros 9, 17, 25
        tipo_accion          CHAR(1)      NULL,                -- cuadro 9: 'S' | 'N'
        elegibilidad         CHAR(1)      NULL,                -- cuadro 9: 'E' | 'R'
        condicion            CHAR(1)      NULL,                -- cuadro 17: 'E' | 'R'
        unidad_indexada      VARCHAR(10)  NULL,                -- cuadros 29, 30

        -- Filas que son totales/subtotales
        es_subtotal          BIT          NOT NULL CONSTRAINT DF_AFP_CL_SP_Fila_es_subtotal DEFAULT 0,

        created_at           DATETIME2(0) NOT NULL CONSTRAINT DF_AFP_CL_SP_Fila_created_at  DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_AFP_CL_SP_Fila PRIMARY KEY (fila_id),
        CONSTRAINT CK_AFP_CL_SP_Fila_cuadro CHECK (cuadro BETWEEN 1 AND 30)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AFP_CL_SP_Fila_periodo'        AND object_id=OBJECT_ID('dbo.AFP_CL_SP_Fila'))
    CREATE INDEX IX_AFP_CL_SP_Fila_periodo        ON dbo.AFP_CL_SP_Fila (periodo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AFP_CL_SP_Fila_cuadro_periodo' AND object_id=OBJECT_ID('dbo.AFP_CL_SP_Fila'))
    CREATE INDEX IX_AFP_CL_SP_Fila_cuadro_periodo ON dbo.AFP_CL_SP_Fila (cuadro, periodo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AFP_CL_SP_Fila_cuadro_glosa'   AND object_id=OBJECT_ID('dbo.AFP_CL_SP_Fila'))
    CREATE INDEX IX_AFP_CL_SP_Fila_cuadro_glosa   ON dbo.AFP_CL_SP_Fila (cuadro, glosa);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AFP_CL_SP_Fila_nemotecnico'    AND object_id=OBJECT_ID('dbo.AFP_CL_SP_Fila'))
    CREATE INDEX IX_AFP_CL_SP_Fila_nemotecnico    ON dbo.AFP_CL_SP_Fila (nemotecnico) WHERE nemotecnico IS NOT NULL;
GO

-- ----------------------------------------------------------------------------
-- 2. Valores por tipo de fondo (cuadros con <tipofondo codigo="A..E"> + <total>)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AFP_CL_SP_Valor_Fondo' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AFP_CL_SP_Valor_Fondo (
        fila_id                       BIGINT       NOT NULL,
        tipo_fondo                    VARCHAR(10)  NOT NULL,

        monto_dolares                 DECIMAL(20,4) NULL,
        monto_pesos                   DECIMAL(20,2) NULL,   -- cuadros 3, 8
        porcentaje                    DECIMAL(10,4) NULL,
        porcentaje_sobre_emisor       DECIMAL(10,4) NULL,   -- cuadros 9, 17
        porcentaje_sobre_extranjero   DECIMAL(10,4) NULL,   -- cuadros 18, 20, 22, 25

        CONSTRAINT PK_AFP_CL_SP_Valor_Fondo PRIMARY KEY (fila_id, tipo_fondo),
        CONSTRAINT FK_AFP_CL_SP_Valor_Fondo_Fila FOREIGN KEY (fila_id)
            REFERENCES dbo.AFP_CL_SP_Fila (fila_id) ON DELETE CASCADE,
        CONSTRAINT CK_AFP_CL_SP_Valor_Fondo_tipo CHECK (tipo_fondo IN ('A','B','C','D','E','TOTAL'))
    );
END;
GO

-- ----------------------------------------------------------------------------
-- 3. Valores por AFP (cuadros 2, 14-16, 19, 21, 23)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AFP_CL_SP_Valor_AFP' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AFP_CL_SP_Valor_AFP (
        fila_id              BIGINT       NOT NULL,

        -- 'TOTAL' para la columna <total> agregada; sino RUT formato 'numero-dv'
        afp_rut              VARCHAR(20)  NOT NULL,
        afp_nombre           VARCHAR(20)  NOT NULL,           -- 'CAPITAL','CUPRUM','HABITAT','MODELO','PLANVITAL','PROVIDA','UNO','TOTAL'

        monto_dolares        DECIMAL(20,4) NULL,
        porcentaje           DECIMAL(10,4) NULL,

        CONSTRAINT PK_AFP_CL_SP_Valor_AFP PRIMARY KEY (fila_id, afp_rut),
        CONSTRAINT FK_AFP_CL_SP_Valor_AFP_Fila FOREIGN KEY (fila_id)
            REFERENCES dbo.AFP_CL_SP_Fila (fila_id) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AFP_CL_SP_Valor_AFP_nombre' AND object_id=OBJECT_ID('dbo.AFP_CL_SP_Valor_AFP'))
    CREATE INDEX IX_AFP_CL_SP_Valor_AFP_nombre ON dbo.AFP_CL_SP_Valor_AFP (afp_nombre);
GO

-- ----------------------------------------------------------------------------
-- 4. Valores por instrumento (cuadro 8: instrumentos como columnas)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AFP_CL_SP_Valor_Instrumento' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AFP_CL_SP_Valor_Instrumento (
        fila_id              BIGINT       NOT NULL,
        instrumento_glosa    NVARCHAR(100) NOT NULL,          -- 'BCU','BTP','BTU','BVL','PDC', etc.

        porcentaje           DECIMAL(10,4) NULL,
        monto_pesos          DECIMAL(20,2) NULL,
        monto_dolares        DECIMAL(20,4) NULL,

        CONSTRAINT PK_AFP_CL_SP_Valor_Instrumento PRIMARY KEY (fila_id, instrumento_glosa),
        CONSTRAINT FK_AFP_CL_SP_Valor_Instrumento_Fila FOREIGN KEY (fila_id)
            REFERENCES dbo.AFP_CL_SP_Fila (fila_id) ON DELETE CASCADE
    );
END;
GO

-- ----------------------------------------------------------------------------
-- 5. Cotizantes mensuales por AFP (scrape de 03F.html, no del XML)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AFP_CL_SP_Cotizantes' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AFP_CL_SP_Cotizantes (
        fecha           DATE         NOT NULL,                -- ultimo dia del periodo
        afp             VARCHAR(20)  NOT NULL,                -- CAPITAL/CUPRUM/HABITAT/MODELO/PLANVITAL/PROVIDA/UNO
        n_cotizantes    INT          NOT NULL,

        CONSTRAINT PK_AFP_CL_SP_Cotizantes PRIMARY KEY (fecha, afp)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AFP_CL_SP_Cotizantes_fecha' AND object_id=OBJECT_ID('dbo.AFP_CL_SP_Cotizantes'))
    CREATE INDEX IX_AFP_CL_SP_Cotizantes_fecha ON dbo.AFP_CL_SP_Cotizantes (fecha);
GO
