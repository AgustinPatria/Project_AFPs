-- ============================================================================
-- Re-cableo Distributors (Sec09): distribuidor desde SQL Server, no del Excel
-- ----------------------------------------------------------------------------
-- Estado: PREPARADO, NO APLICADO. Aplicar SOLO despues de:
--   1) Corregir DIM_BD_FUNDS_2_INTMDO.Distributor en SQL Server con
--      validacion/distributors_sql_migration/fix_distribuidor.sql (50 fondos
--      donde el traspaso dejo el manager en vez del distribuidor local) + los
--      4 casos REVISAR de correcciones_distribuidor.csv.
--   2) Traer la columna Distributor al sync (ver PASO B) y correr sync_dim_bd_funds.
--
-- Que hace: v_distributors_sec09 deja de leer el distribuidor de
-- dim_foreign_classification_overlay (Excel 04_tabla_sin_desfase_25.xlsm /
-- Output_25sd) y lo resuelve por el join ISIN -> dim_homol_funds -> dim_bd_funds
-- (fuente SQL Server), con la MISMA prioridad de Source que v_consolidated_*.
-- El bucket '[Direct Investment]' se preserva via dim_direct_investment_overlay
-- (los bonos directos no son fondos y no cuelgan de un distribuidor).
--
-- Cobertura verificada 2026-06-30 (AUM foreign 139.146 USD MM): join SQL cubre
-- 95,5%; el 4,1% que "pierde" son [Direct Investment] (preservados aca); rescata
-- 28 ISIN hoy Unmapped; concordancia 93,5% del AUM (resto = los 50 fondos del fix).
-- ============================================================================

-- ── PASO A · schema: agregar la columna distributor a dim_bd_funds ───────────
-- (fue dropeada en junio con migration drop_distributor_from_dim_bd_funds cuando
--  la fuente estaba vacia; hoy DIM_BD_FUNDS_2_INTMDO.Distributor esta 100% poblada)
ALTER TABLE dim_bd_funds ADD COLUMN IF NOT EXISTS distributor varchar(120);

-- ── PASO B · sync (hacer en sync/sync_sqlserver_to_supabase.py, sync_dim_bd_funds)
-- Agregar al SELECT de DIM_BD_FUNDS_2_INTMDO:
--     [Distributor] AS distributor
-- y luego:  python -c "... sync_dim_bd_funds(...)"   (upsert por id, ya escribe
-- la columna nueva). NO incluido aca porque es cambio de codigo Python, no SQL.

-- ── PASO C · vista: re-cablear v_distributors_sec09 a la fuente SQL ──────────
CREATE OR REPLACE VIEW v_distributors_sec09 AS
WITH base AS (
  SELECT s.fecha_reporte, s.isin, s.monto_dolares AS monto_usd_mm
  FROM v_consolidated_foreign_classified s
  WHERE s.monto_dolares > 0::numeric AND s.isin IS NOT NULL
),
-- ISIN -> fondo (id) por homol, prioridad de Source identica a fund_class de
-- v_consolidated_foreign_classified (AFP_CL > LICS_CL > CARTERAS_FM_CMF > RUT_CMF).
isin_fund AS (
  SELECT DISTINCT ON (h.name)
         h.name AS isin,
         bf.distributor,
         bf.manager
  FROM dim_homol_funds h
  JOIN dim_bd_funds bf ON bf.id::text = h.id::text
  ORDER BY h.name,
    (CASE h.source
       WHEN 'AFP_CL'          THEN 1
       WHEN 'LICS_CL'         THEN 2
       WHEN 'CARTERAS_FM_CMF' THEN 3
       WHEN 'RUT_CMF'         THEN 4
       ELSE 5 END)
),
resolved AS (
  SELECT b.fecha_reporte, b.isin,
    CASE WHEN di.identificador IS NOT NULL THEN '[Direct Investment]'::text
         ELSE COALESCE(NULLIF(TRIM(BOTH FROM f.distributor), ''), 'Unmapped'::text)
    END AS distributor,
    CASE WHEN di.identificador IS NOT NULL THEN '[Direct Investment]'::text
         ELSE COALESCE(f.manager::text, '(no manager)'::text)
    END AS manager,
    (di.identificador IS NOT NULL
       OR NULLIF(TRIM(BOTH FROM f.distributor), '') IS NOT NULL) AS is_mapped,
    b.monto_usd_mm
  FROM base b
  LEFT JOIN isin_fund f ON f.isin = b.isin
  LEFT JOIN dim_direct_investment_overlay di ON upper(di.identificador) = upper(b.isin)
)
SELECT fecha_reporte, distributor, manager,
       bool_or(is_mapped) AS is_mapped,
       sum(monto_usd_mm)  AS monto_usd_mm
FROM resolved
GROUP BY fecha_reporte, distributor, manager;

-- ── PASO D · validacion post-switch (antes de retirar el Excel) ──────────────
--  1) Total y Unmapped vs baseline Excel para la ultima fecha:
--       SELECT distributor='Unmapped' AS unmapped, count(*), round(sum(monto_usd_mm))
--       FROM v_distributors_sec09 WHERE fecha_reporte=(SELECT max(fecha_reporte)
--       FROM v_distributors_sec09) GROUP BY 1;
--     Esperado: Unmapped <= baseline (Excel dejaba 21 ISIN / 2.077 USD MM).
--  2) Que el bucket '[Direct Investment]' aparezca con monto ~ al del Excel hoy.
--  3) Reconciliar los ~50 fondos corregidos vs el PDF Sec09.
--
-- ── Retiro (cuando D valide) ────────────────────────────────────────────────
--  * dim_foreign_classification_overlay deja de alimentar Distributors. Ojo:
--    todavia la usan v_chist_foreign_classified y v_consolidated_foreign_classified
--    (columnas category/region override). NO dropear hasta migrar tambien esas.
--  * export_foreign_overlay.py / load_foreign_overlay.py: solo retirar la parte
--    de distribuidor; el overlay sigue vivo para category/region hasta migrarlas.
