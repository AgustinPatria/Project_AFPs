-- ============================================================================
-- AFP_CL_DIM_Family_Comp — universo de peers por familia (sec 04 del PDF).
-- DB destino: Inteligencia_Mercado.dbo
--
-- Reemplaza la curacion previa que vivia solo en Supabase
-- (dim_bd_family_comp, 115 filas) y migra a SQL Server como source of truth,
-- siguiendo el patron arquitectonico de 2026-05-27.
--
-- NO confundir con dbo.DIM_BD_Family_Comp del equipo IM (23 filas, stale).
-- Esta es nuestra tabla curada con las 115 filas validadas contra el Excel
-- 18_MktShare_AssetClass.xlsm.
--
-- PK natural: (family_id, id). 115 filas, 12 familias, 104 'Peer Group' + 11 'Moneda'.
-- ============================================================================

USE Inteligencia_Mercado;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AFP_CL_DIM_Family_Comp' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AFP_CL_DIM_Family_Comp (
        family_id           INT           NOT NULL,
        id                  INT           NOT NULL,                 -- dim_bd_funds.id (varchar en Supabase; aqui mantenemos INT)
        tipo                NVARCHAR(50)  NULL,                     -- 'Peer Group' | 'Moneda'
        fund_short_name     NVARCHAR(200) NULL,

        CONSTRAINT PK_AFP_CL_DIM_Family_Comp PRIMARY KEY (family_id, id)
    );
END;
GO
