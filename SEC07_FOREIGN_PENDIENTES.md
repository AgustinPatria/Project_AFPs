# Sección 07 — Foreign Investment · Pendientes

Revisión página por página del PDF `07 202511 Foreign Investment.pdf` contra el
módulo `/foreign` del dashboard y los datos de Supabase. Fecha de revisión:
2026-05-22. PDF de referencia: reporte de Nov-2025 (columnas Dec-24 / Oct-25 /
Nov-25 y Nov-22 / Nov-24 / Nov-25).

## Ya resuelto

- **Fuente FI/Equity**: la vista `v_foreign_pdf_summary_combined` usaba CHIST,
  que mis-clasificaba EM Latam (~−866 USD mm en Nov-25). Migración
  `foreign_combined_prefer_sp_for_fi_equity` (2026-05-22) la cambió a SP XML
  autoritativo. Total combined vs PDF: ±3 USD mm en Oct-25/Nov-25/Nov-24/Nov-22.
- **Baselines LTM/3Y** del tab *Changes*: estaban vacíos en FI/Equity para
  Nov-22/Nov-24; quedaron poblados como efecto del cambio de fuente.
- **Pendiente 2 (Asia Pacific HY)** — RESUELTO 2026-05-22. Ver abajo.
- **Tabla de override de región** creada: `dim_foreign_region_override`
  (`fund_id → region`), aplicada vía `COALESCE` en `v_sp_foreign_classified`.
  Es la infraestructura para corregir discrepancias de región vs el PDF.

---

## Pendiente 1 — Clasificación: SP confunde Europe ↔ Global en FI DM — ✅ RESUELTO (2026-06-10)

- **Qué era**: SP etiquetaba ~1,000 USD mm de FI europeo como subregión
  "Global". En Nov-25: SP Europe FI = 122 vs PDF 1,043.
- **Causa raíz**: `dim_foreign_classification_overlay` (la hoja `Output_25sd`
  del Excel legacy, la clasificación con la que se imprime el PDF) solo se
  aplicaba en la rama CHIST. La rama SP — la dominante desde 2026-05-22 —
  clasificaba solo vía `dim_homol_funds → dim_bd_funds`.
- **Fix**: migración `sp_foreign_apply_overlay` (SQL en
  `sync/sp_foreign_apply_overlay.sql`). `v_sp_foreign_classified` ahora aplica
  `region`/`category` con prioridad: `dim_foreign_region_override` >
  overlay (con `NULLIF` para vacíos) > `dim_bd_funds`. `asset_class` y columnas
  `nt_*` intactas. Además el CASE EM/DM legacy de `v_sp_foreign_pdf` reconoce
  `'Asia Pacific ex Japan'` (EM) y `'Australia'` (DM), paridad con CHIST.
- **Resultado Nov-25**: Europe FI 122→**1,043** (PDF 1,043 ✓), movido desde
  Global (BlueBay Financial Capital 878, BlueBay IG Financials 121, DWS Euro HY
  10, Robeco 3) y NA +110 (GAM Star). Totales por bucket sin cambios.
- **Residuo conocido**: FI GEM queda 9,226 vs 9,119 del PDF Nov-25 (+107):
  UBS Global Bonds (238, Global→GEM) y William Blair EMD (133, GEM→Global)
  fueron reclasificados en `Output_25sd` DESPUÉS de imprimir el PDF Nov-25. El
  overlay refleja la clasificación vigente; validar contra el próximo PDF.
- **Nota**: el override `3838 → GEM` (GS Asia HY) podría estar obsoleto — el
  Output_25sd actual lo clasifica "Asia Pacific". Re-validar con el próximo PDF
  y, si corresponde, borrar la fila de `dim_foreign_region_override`.

## Pendiente 2 — Clasificación: Asia Pacific HY (~+107) — ✅ RESUELTO (2026-05-22)

- **Qué era**: FI EM Asia Pacific High Yield mostraba ~126 USD mm vs ~19 del PDF.
- **Causa**: un solo fondo — Goldman Sachs Asia High Yield Bond Portfolio
  (`fund_id=3838`, 106.8 USD mm) — con `dim_bd_funds.region='Asia Pacific'`,
  pero el PDF lo clasifica como GEM.
- **Fix**: tabla `dim_foreign_region_override` con fila `3838 → GEM`, aplicada
  vía `COALESCE` en `v_sp_foreign_classified` (migración
  `foreign_region_override_table`).
- **Resultado**: Asia Pacific 135→28 (PDF 28 ✓), GEM 9,011→9,118 (PDF 9,119 ✓).
  Verificado en el dashboard.

## Pendiente 3 — Gap de datos: no hay split Return / Flows — ✅ RESUELTO en data (2026-06-10)

- **Qué era**: el PDF descompone cada cambio en **Return** + **Flows**; no
  teníamos la serie de retornos para separarlos.
- **Solución**: la serie de retornos Bloomberg que usa el legacy estaba
  acumulada en la hoja `Rentab` de `11_Flows03.xlsm` (627 tickers, 2021-07 →
  2026-03). Pipeline nuevo:
  `Excel → SQL Server dbo.AFP_CL_BBG_Returns_Foreign (historia completa) →
  Supabase bbg_returns_foreign (ventana 2025+)`.
  Scripts: `sync/excel/seed/extract_bbg_returns.py` (Excel→SQL, idempotente) y
  `sync/sync_bbg_returns_to_supabase.py` (mirror).
- **Metodología replicada exacta del legacy** (fórmulas de las matrices
  Change/Return/Flows del 11_Flows03): scope = Equity/FI/PE sin Direct Inv;
  `change = pos_t − pos_{t-1}`; `return = pos_{t-1} × ret%` solo si el
  instrumento está en ambos meses (sin retorno BBG ⇒ 0, caso PE);
  `flow = change − return`. Vistas: `v_foreign_returns_flows` (por ISIN×mes) y
  `mv_/v_foreign_returns_flows_summary` (por bucket/región/categoría, legacy+nt).
  Cobertura: **Feb-2025 → Mar-2026** (limitada a meses con retornos; Ene-25
  requeriría posición Dic-24).
- **Validación vs PDF Nov-25 (panel monthly de Flows1)**: Returns calzan al
  decimal (Latam 22.5 ✓, Asia Pacific −0.2 ✓, North America −11.8 ✓, GEM 55.5
  vs 56.1). Los Flows difieren por **un bug del legacy descubierto en esta
  revisión**: las matrices Change/Return/Flows van de la fila 7 a la 2000,
  pero Output_25sd tiene 2,123 instrumentos — los 116 excluidos suman USD
  1,108 mm de cambio Oct→Nov que el PDF omite de Return/Flows (pero sí están
  en las columnas de posición; por eso en el PDF `start + Total Change ≠ end`).
  Diffs verificados: FI Latam 34.8 = exacto, FI GEM 164, FI Global 437.
  Además el panel excluye instrumentos sin región en Output_25sd (~2.9 bn NA).
  **Decisión (consistente con el precedente Aegon): NO replicamos el bug** — el
  dashboard reporta el split completo.
- **Pendiente UI**: conectar `v_foreign_returns_flows_summary` al tab *Changes*
  del dashboard (hoy sigue mostrando delta de posición).
- **Pendiente refresh mensual**: tras cada cierre, correr extract_bbg_returns
  (cuando exista el workbook nuevo) + sync_bbg_returns_to_supabase + REFRESH
  de `mv_foreign_returns_flows_summary`.

## Incidente 2026-06-11 — baselines Nov-22/Nov-24 borrados por el cleanup del mirror — ✅ Nov-24 restaurado

- **Qué pasó**: `cleanup_out_of_window()` de `sync_sp_sqlserver_to_supabase.py`
  borra todo periodo < 2025-01 en cada corrida default. Eso eliminó los
  backfills Nov-22/Nov-24 (baselines 3Y/LTM del tab Changes). Las matviews los
  siguieron sirviendo stale hasta el refresh del 2026-06-10 (migración del
  overlay), que materializó la pérdida: esas fechas quedaron como
  "solo Direct Investment" en el combined. Además las matviews DI llevaban sin
  refresh desde Nov-25 → no había DI para Dic-25→Abr-26.
- **Fix aplicado (2026-06-11)**:
  1. `BASELINE_PERIODOS = ('2022-11','2024-11')` — el cleanup ahora los preserva.
  2. Re-mirror `--periodo 2024-11` desde SQL Server (3,926 sp_fila + hijas).
  3. REFRESH de las 4 matviews foreign (sp_pdf_summary, DI detail/summary,
     returns_flows).
- **Resultado**: Abr-26 con DI (5,473); serie DI continua Oct-25→Abr-26
  (Mar-26 = 6,567 = PDF exacto); Nov-24 completo (FI 17,794 vs PDF 17,782,
  +0.07%); Nov-22 desaparece del date set → el botón 3Y queda deshabilitado
  (honesto) hasta restaurarlo.
- **Pendiente**: Nov-22 NO existe ni en SQL Server (el traspaso 2026-05-27 no
  lo incluyó) — solo en `TBL_SPE_REPORTE25_SD` y el Excel. Su restauración es
  parte del backfill histórico (ver Pendiente 4).
- **Lección operativa**: después de cualquier corrida del sync SP o cambio en
  dims, refrescar TODAS las matviews foreign — hay 7:
  `mv_foreign_pdf_summary` (CHIST), `mv_sp_foreign_pdf_summary`,
  `mv_sp_direct_investment_detail`, `mv_sp_direct_investment_summary`,
  `mv_chist_foreign_managers`, `mv_foreign_returns_flows_summary`,
  `mv_foreign_fund_flows`.

## Sec 08 integrada (2026-06-11)

- El PDF Sec 08 (Top Net Purchases and Sales — Foreign Funds) ahora vive en
  `/foreign` tab *Changes* (card Top Flows), sidebar badge `07·08`.
- Motor nuevo: `mv_/v_foreign_fund_flows` (flow = Δposición − return por ISIN,
  agregado a fondo). Reemplaza la metodología CHIST units×price que quedaba
  vacía en fechas SP.
- Validado vs `dim_sec08_top_flows` (seed con los valores impresos del PDF
  Mar-26): outflows MTD 10/10 al decimal; inflows/YTD con todos los valores
  del PDF exactos. Los rankings difieren donde aparecen fondos que el PDF
  omite por el bug de truncamiento fila-2000 (documentado en el card).
- `Sec08TopFlowsCard` (componente huérfano que renderizaba el seed) quedó sin
  uso — candidato a eliminación.

## Pendiente 4 — Gap de datos: historia FI/Equity pre-2025

- **Qué**: la vista combinada solo tiene FI/Equity para 2025 (más Nov-22 y
  Nov-24 sueltas). Los gráficos de área de las páginas 7-9 del PDF abarcan
  varios años; el dashboard solo muestra Ene-25 → Nov-25.
- **Impacto**: el tab *Evolution* muestra "evolución" de un solo año. El tab
  *Latam* tiene un artefacto: la línea de % parte en 0% en Nov-22 y pega un
  salto vertical a 2025.
- **Qué se necesita**: backfill de SP XML (o CHIST clasificado) para meses
  anteriores a 2025.
- **Prioridad**: baja por ahora (fuera de scope acordado), pero pendiente.

## Pendiente 5 — Frontend: `buildPdfTree` no renderiza bucket "Other"

- **Qué**: en `web/lib/types-foreign.ts`, `buildPdfTree` suma todos los buckets
  al *Total Foreign Investment* pero solo renderiza filas para Fixed Income,
  Equity, Private Equity, Direct Investment y Unknown. Un bucket "Other" se
  sumaría al total sin fila visible (las filas no reconciliarían con el total).
- **Estado**: latente — con la fuente SP ya no aparece bucket "Other" (SP genera
  "Unknown", que sí se renderiza). No se dispara hoy.
- **Prioridad**: baja — fix preventivo de UI.

## Pendiente 6 — Validación incompleta: solo 2 de 11 meses de 2025

- **Qué**: el diff SP vs PDF solo se pudo correr para Oct-25 y Nov-25, porque el
  repo solo tiene el reporte PDF de Nov-2025. Ene-25 a Sep-25 no están validados
  contra PDF.
- **Qué se necesita**: los reportes PDF mensuales de Foreign Investment de
  Ene-2025 a Sep-2025 para validar las 11 fechas.
- **Prioridad**: media — Oct/Nov son evidencia fuerte pero no completa.
