# Plan de re-cableado — Dashboard sobre SQL Server (fuente única)

> Objetivo: reconectar todo el dashboard para que su **única fuente de origen sea SQL Server** (`Inteligencia_Mercado` + `Inteligencia_Producto_Dev` + `DW_MONEDA`), reemplazando el mix actual (SP XML, overlays manuales, seeds Excel/JSON, remanente manual).
>
> Estado: **diseño aprobado, sin implementar**. Verificaciones empíricas hechas 2026-06-25 (ver `LINEAGE.md` y memoria del proyecto).

## Principios

1. **Híbrido, sin-desfase por defecto.** Una card = un solo mundo. El `AsOfBadge` (ya existe) muestra honestamente la fecha de cada sección.
2. **No mezclar mundos dentro de un mismo número** (hoy las vistas `*_combined` lo hacen; las separamos).
3. **Entrega igual que hoy**: tablas SQL → sync a Supabase → vistas `v_*` → front por REST (Patria bloquea Postgres directo). SQL = origen/verdad, no lo lee el front.
4. **Clasificación en dos pipelines**: `consolidated_sd` se auto-clasifica (DIM_BD_Previa → HOMOL/BD); `chist_adjusted` ya trae `Supracategory`.

## Arquitectura de entrega

```
SQL Server (origen único)
  ├─ Inteligencia_Mercado.dbo: AFP_CL_09_17_25_sd_consolidated, AFP_CL_CHIST_ADJUSTED,
  │     AFP_CL_VC_PAT, AFP_CL_BBG_Returns, AFP_CL_01_sd/02_sd, DIM_BD_Previa_AFPCL,
  │     DIM_BD_FUNDS_2_INTMDO, DIM_HOMOL_FUNDS_INTMDO
  ├─ Inteligencia_Producto_Dev.dimensionales: BD_Instrumentos, HOMOL_Instrumentos, BD_GICS
  └─ DW_MONEDA: TBL_RENTABILIDADES_DW (FX)
        │  (sync REST, scripts en sync/)
        ▼
Supabase (mirror): consolidated_sd, chist_adjusted, valores_cuota_patrimonio(*), bbg_returns,
        sd_asset_class_*, dim_bd_previa, dim_bd_funds, dim_homol_funds, dim_ipd_*, tipo_cambio, cotizantes_afp
        │  (vistas v_*)
        ▼
Next.js dashboard
(*) valores_cuota_patrimonio: se mantiene el nombre de tabla, cambia el origen a AFP_CL_VC_PAT.
```

## Capa de sync nueva (SQL → Supabase)

| Tabla Supabase | Origen SQL | Notas |
|---|---|---|
| `consolidated_sd` (nueva) | `AFP_CL_09_17_25_sd_consolidated` | sistema × tipo_fondo × nemo + límites. UPSERT por `(fecha,tipo_fondo,nemotecnico,Source)` |
| `chist_adjusted` (nueva) | `AFP_CL_CHIST_ADJUSTED` | **ver estrategia de storage abajo** |
| `valores_cuota_patrimonio` (re-origen) | `AFP_CL_VC_PAT` | mismo esquema, swap de fuente. Diario |
| `bbg_returns` (nueva, reemplaza `bbg_returns_foreign`) | `AFP_CL_BBG_Returns` | retorno USD mensual por `Nemo_SP` |
| `dim_bd_previa` (nueva) | `DIM_BD_Previa_AFPCL` | `Nemo → Type∈{FUND,DIRECT_INV}` |
| `sd_asset_class_tipo/afp` | `AFP_CL_01_sd/02_sd` | **ya existe**, sin cambios |
| `dim_bd_funds`, `dim_homol_funds` | `DIM_BD_FUNDS_2_INTMDO`, `DIM_HOMOL_FUNDS_INTMDO` | **ya existen**. Verificado: `dim_bd_funds` trae `asset_class/alt_fund_type/alt_strategy/region` ✅ pero **falta `distributor`** ❌ → extender el sync para traerla (la usa Distributors) |
| `dim_ipd_*` (instrumentos/GICS) | `BD_Instrumentos`, `HOMOL_Instrumentos`, `BD_GICS` | **ya existen** (sync_inteligencia_producto) |
| `tipo_cambio`, `cotizantes_afp` | DW_MONEDA, scrape SP | **sin cambios** |

### Estrategia de ventana / storage (verificado 2026-06-25)
Tamaños reales (tabla completa, SQL): `CHIST_ADJUSTED` 3,6 GB / `consolidated_sd` 31 MB / `VC_PAT` 11 MB / `BBG_Returns` 2,7 MB. Free-tier Supabase = 500 MB.

**El único pesado es `chist_adjusted`.** Estrategia (historia completa donde es barata, ventana solo donde duele):
- **`consolidated_sd`, `vc_pat`, `bbg_returns`, `sd_asset_class_*` → historia COMPLETA** (caben de sobra). Esto da time-series full-history a Asset Allocation, Market Share, Totales, Foreign-sistema, Strategy y Chilean-Stocks-sistema.
- **`chist_adjusted` → ventana `fecha >= 2025-01-01`** + excluir `Supracategory IN ('Direct Inv. RF Nacional','Derivados Nacional','Derivados Extranjero','Disponible Nacional')`. **Derivados verificado 2026-06-25: el dashboard solo los muestra como línea agregada en Asset Allocation (`v_asset_class_tipo_sd` ya trae `Foreign/Local Derivatives`); ninguna vista de detalle los usa → no se sincronizan al detalle.** 2025+ con este filtro = ~150k filas ≈ **~37 MB**. Buckets que SÍ van: Fondos, Direct Inv. RV Nacional, Direct Inv. RV/RF Extranjera, Direct Inv. Alternativos, Disponible Extranjera. Pruning de columnas forward/swap reduce más.
- **Evolución NAV/Uncalled de Alternativos pre-2025**: sincronizar un **agregado mensual** (mes × afp × tipo, KBs), no el detalle.
- Decisión de infra: conectar el dashboard (Vercel) directo a SQL **no es viable** (SQL está en red interna Patria; Vercel solo alcanza DBs en la nube por HTTPS → por eso Supabase). Para detalle full-history más adelante: **Supabase Pro** (8 GB, $25/mes). Hoy no es necesario.

### Monitoreo de tamaño (disciplina obligatoria en Fase 0)
Base real hoy = **0,224 GB** (métrica del panel Supabase; `pg_database_size` = 199 MB, el gap ~25 MB es overhead WAL/catálogos y **crece con la rotación de datos**). Reglas:
- **Chequear tamaño antes y después de cada sync** (`SELECT pg_size_pretty(pg_database_size(current_database()))`).
- **Cargar en lotes** y dejar autovacuum / `VACUUM` tras cargas grandes para no acumular dead tuples.
- **Retirar tablas viejas apenas su reemplazo valida** (no esperar a Fase 3) para aplanar el pico de transición — ej.: drop `historial_carteras_full` (62 MB) en cuanto Alternatives valide; drop `sp_*` cuando consolidated_sd cubra.
- Umbral de alerta: si el panel pasa de ~400 MB, frenar y limpiar antes de seguir.

## Plan sección por sección

Leyenda mundo: **NL** = sin desfase (fresco, ~2026-05) · **L** = con desfase (CHIST, ~2026-01).

### 1. Home / Alternatives — Mundo **L**
| | |
|---|---|
| Origen nuevo | `chist_adjusted` (alternativos) + `valores_cuota_patrimonio`(VC_PAT) + `tipo_cambio` |
| Filtro alt | `Supracategory='Direct Inv. Alternativos'` **+** Fondos con `dim_bd_funds.Asset_Class='Alternative'` |
| Métricas | **NAV = `Type='Valorización'`**, **Uncalled = `Type='Remanente'`**, AUM ← VC_PAT patrimonio |
| Cruces | nemo → `dim_homol_funds.Name` (dedup por Source AFP_CL>LICS>…) → `id` → `dim_bd_funds` |
| Vistas | reescribir `v_chist_aa` → alimenta `v_total/v_aum/v_nav/v_uncalled/v_afp_c1/v_afp_c2` |
| Retira | `historial_carteras(_full)`, `dim_valorizacion_remanente` (remanente ya viene) |
| Validación | NAV/Uncalled ya reconciliados <2% (2026-01). Repetir para AUM y cortes C1/C2 |

### 2. Asset Allocation — Mundo **NL** — SIN CAMBIOS
Ya migrado a `sd_asset_class_*` ← `AFP_CL_01_sd/02_sd`. Solo borrar las vistas viejas pendientes.

### 3. Market Share — Mundo **NL**
| | |
|---|---|
| Origen nuevo | `valores_cuota_patrimonio`(VC_PAT) + `tipo_cambio` + `cotizantes_afp` |
| Cambio | repuntar la matemática de cuota (`v_cuota_month_end`, `v_daily_flows`, `mv_returns_afp_tipo`) de la tabla vieja a VC_PAT (mismo esquema). Cotizantes sin cambios |
| Vistas | `v_returns_afp_tipo`, `v_contributors_market_share` (re-origen, misma forma) |
| Validación | retornos/flows/AUM por AFP×tipo vs vistas actuales |

### 4. Chilean Stocks — **NL** (sistema) + **L** (columna AFPs)
| | |
|---|---|
| Sistema (GICS, nemo, transactions) | **NL**: `consolidated_sd` (Equity nac, Source 09/17) + `dim_ipd_*`(BD_Instrumentos/GICS) + `dim_chilean_ticker_homol` + `dim_chilean_stocks_gics_override` |
| Columna AFPs (Sec05) | **L**: `chist_adjusted` `Supracategory='Direct Inv. RV Nacional'` por AFP |
| Gana | hoy es CHIST (desfasado); pasa a **fresco** en la vista sistema |
| Pendiente | Pionero/MRV + IPSA/BDChile + `f_sec05_*` → **diferido** (seeds, ver Fase 4). `dim_chilean_ticker_homol` sigue siendo hueco manual |
| Validación | breakdown GICS sistema vs PDF/actual |

### 5. Strategy — Mundo **NL**
| | |
|---|---|
| Origen nuevo | `consolidated_sd` (Fondos) + `dim_bd_family` + `dim_bd_family_comp` + `dim_bd_funds` |
| Vistas | `v_sp_strategy_aum` → `v_strategy_aum` (re-origen a consolidated_sd). Local equity DI vs IF → `consolidated_sd` (Equity nac DI + fondos locales) |
| Validación | AUM por familia/fondo vs actual |

### 6. Foreign / Managers — **NL** (resumen) + **L** (por AFP)  ← sección más compleja
| Card | Mundo | Origen |
|---|---|---|
| Resumen sistema, evolution, latam | **NL** | `consolidated_sd` cuadro 25 (extranjero) + clasificación DIM_BD_Previa→HOMOL/BD |
| Managers por AFP | **L** | `chist_adjusted` (`Direct Inv. RF/RV Extranjera` + Fondos foreign) por AFP |
| Direct Investment detail | **L** | `chist_adjusted` Direct Inv. ext + `dim_ipd_*`(instrumentos) |
| Returns/flows (Sec07 p4-5) | **NL** | `bbg_returns` + cuota |
| Región / EM-DM / sub-región | — | de `dim_bd_funds.Region`/`New_Region` y `BD_Instrumentos`. **Validar si los overlays (`dim_foreign_classification_overlay`, `dim_foreign_region_override`) siguen necesarios o se retiran** |
| Vistas | reemplazar `v_foreign_pdf_summary_combined` y `v_foreign_managers_combined` por versiones de un solo mundo cada una | |
| Validación | vs PDF Sec07 (buckets ±, sub-región). Decidir overlays según gap |

### 7. Distributors — Mundo **L**
| | |
|---|---|
| Origen nuevo | `chist_adjusted` (fondos foreign por distribuidor) |
| Distribuidor | **CORREGIDO 2026-06-25: `DIM_BD_FUNDS_2_INTMDO.Distributor` está VACÍA (todo `-`), no sirve.** El distribuidor viene del mapeo a nivel **manager** (`dim_distributor_by_manager`, manual en Supabase). → otro hueco "no está en SQL" (ver pendientes) |
| Validación | Sec09 por distribuidor vs actual |

### 8. Transversales
- `v_module_freshness`: repuntar a las nuevas tablas (`consolidated_sd`, `chist_adjusted`, `valores_cuota_patrimonio`, `bbg_returns`, `sd_*`, `cotizantes_afp`).
- `dim_data_sources` (SourceBadge): mantener, actualizar `last_loaded_at` desde los nuevos syncs.

## Qué se retira al final

| Se retira | Reemplazado por |
|---|---|
| SP XML two-hop (`sp_fila/sp_valor_*`, `sync_sp_xml.py`) | `consolidated_sd` + `sd_asset_class_*` (confirmar cobertura total antes de apagar) |
| `historial_carteras`, `historial_carteras_full` | `chist_adjusted` |
| `valores_cuota_patrimonio` (origen viejo) | re-origen a `AFP_CL_VC_PAT` |
| `bbg_returns_foreign` (Excel) | `bbg_returns` (SQL) |
| `dim_valorizacion_remanente` (manual) | `Type='Remanente'` en chist_adjusted |
| Overlays foreign/DI (a validar) | `dim_bd_funds`/`BD_Instrumentos` Region/New_Region |

## Fases de ejecución

- **Fase 0 — Sync + storage.** Escribir syncs para `consolidated_sd`, `chist_adjusted` (con filtro/ventana), `dim_bd_previa`, re-origen de `valores_cuota_patrimonio`→VC_PAT y `bbg_returns`. **Dimensionar storage de chist_adjusted** y ajustar filtro. Confirmar columnas nuevas en `dim_bd_funds` (Asset_Class, Alt_*, Region, Distributor).
- **Fase 1 — Clasificación.** Vista auto-clasificadora de `consolidated_sd` (DIM_BD_Previa→HOMOL/BD); passthrough de `Supracategory` para `chist_adjusted`.
- **Fase 2 — Re-cableo por sección** (riesgo creciente): Asset Allocation (nada) → Alternatives (ya validado) → Market Share → Chilean Stocks → Strategy → Foreign → Distributors. Cada una con su check de validación antes de pasar a la siguiente.
- **Fase 3 — Retiro + limpieza.** Apagar SP XML/CHIST viejo/overlays/remanente manual; borrar vistas `*_combined` y `_sd` viejas; repuntar freshness.
- **Fase 4 — ✅ HECHA (2026-07-01).** Seeds Sec05 migrados a SQL vivo: Pionero(33)/MRV(19) desde `TBL_IPA_V2` (type=2, `ipd_cartera_eom`), índices desde `TBL_BMS_Exposicion` (`ipd_bms_membership`: IGPA 16, IGPAL/M/S 17/18/19, IPSA 20 — diaria desde 2025-03). Cuartiles reemplazados por **SIZE** (decisión usuario). RPCs `f_sec05_*` reescritos; `f_sec05_quartile`→`f_sec05_size`; fix 5.2 (nemo argmax) incluido. Dropeados: `dim_benchmark_composition`, `dim_ipsa_composition`, `v_chilean_stocks_moneda_funds`, `ipd_positions` (−28 MB). `dim_bdchile` se mantiene solo por company/grupo; `dim_chilean_ticker_homol` sigue como hueco manual del lado CHIST.

## Validación (regla general)

Por cada sección, reconciliar **totales de la vista nueva vs la vista actual** (que ya tiene parity con el PDF) para un mes común, tolerancia <2-3%. El dashboard ya tiene números validados contra el PDF → sirven de oráculo. Alternatives ya pasó (NAV −0,9%, Uncalled −1,6%).

## Progreso

- **2026-06-25 · Fase 0 · `consolidated_sd` ✅** — tabla creada (migration `create_consolidated_sd`) + carga historia completa (419.481 filas, 169 fechas, 2012-05→2026-05). Reconciliado exacto vs SQL (filas + monto última fecha). DB Supabase 199→246 MB. Scripts: `sync/consolidated_sd_schema.sql`, `sync/sync_consolidated_sd.py`.
- **2026-06-25 · Fase 0 · `bbg_returns` ✅** — tabla creada (migration `create_bbg_returns`) + carga completa (25.715 filas, 59 periodos, 2021-07→2026-05). Reconciliado exacto vs SQL (filas + avg retorno última fecha). DB 246→249 MB. Scripts: `sync/bbg_returns_schema.sql`, `sync/sync_bbg_returns.py`. (Reemplaza a `bbg_returns_foreign`, que se retira luego.)
- **2026-06-25 · Fase 0 · `dim_bd_previa` ✅** — tabla creada (migration `create_dim_bd_previa`) + carga (2.667 filas distintas: FUND 2.121, DIRECT_INV 546; fuente trae 9 dups FUND exactos, deduplicados con DISTINCT). PK = nemo. Scripts: `sync/dim_bd_previa_schema.sql`, `sync/sync_dim_bd_previa.py`.
- **2026-06-25 · Fase 0 · `valores_cuota_patrimonio` re-origen ✅** — `sync_sqlserver_to_supabase.py`: `sync_valores_cuota_patrimonio` repunteado de `TBL_SPE_VALORESCUOTAPATRIMONIO` → `AFP_CL_VC_PAT` + piso fijo `Fecha >= 2020-01-01`. Verificado drop-in: VC_PAT 2020+ = 82.005 filas = tabla actual, mismo rango, valores idénticos → **sin recarga**. Mantener solo 2020+ (decisión del usuario; VC_PAT tiene 2002+ pero no se trae). Reemplaza la rama vieja; tabla LIVE intacta.
- **2026-06-25 · Fase 0 · `dim_bd_funds` — fix `Fondo`→`Fund` ✅ + `distributor` descartado** — el sync estaba ROTO (referenciaba `[Fondo]`, renombrada a `Fund` en el modelo nuevo); corregido en `sync_sqlserver_to_supabase.py` y recargado OK (5.044 filas). La columna `Distributor` de la fuente está vacía (`-`) → NO sirve, se agregó y revirtió (migration `drop_distributor_from_dim_bd_funds`). Distributors usará el mapeo manager-level manual (pendiente #6). Pendiente #7: auditar otros `DIM_BD_*` por renames.
- **2026-06-25 · Fase 0 · `chist_adjusted` ✅** — tabla creada (migration `create_chist_adjusted`) + carga 2025+ filtrada (149.834 filas, 13 fechas 2025-01→2026-01; sin derivados/RF-nac/disp-nac; columnas forward/swap no traídas). DB 249→279 MB. Reconciliación alternativos sobre data sincronizada: NAV 15.383 vs v_nav 15.404 (−0,1%), Uncalled 10.047 vs v_uncalled 10.210 (−1,6%). Scripts: `sync/chist_adjusted_schema.sql`, `sync/sync_chist_adjusted.py`.

### ✅ FASE 0 COMPLETA (2026-06-25)
Todas las tablas fuente sincronizadas y validadas. DB Supabase ~279 MB pg (panel ~306 MB) de 500.

### ✅ FASE 1 COMPLETA (2026-06-25) — capa de clasificación
Vistas creadas (migrations `fase1_classification_layer`, `fase1_consolidated_classified`; versionadas en `sync/v_classification_layer.sql`):
- **`v_fund_class`**: nemo → atributos BD_FUNDS, dedup por prioridad Source en HOMOL. Reutilizable.
- **`v_chist_classified`**: detalle CHIST (desfasado, por AFP) + flag `is_alternative` + atributos de fondo. **Validado**: filtrando `is_alternative` reproduce alternativos exacto (NAV 15.383 / Uncalled 10.047, −0,1%/−1,6%).
- **`v_consolidated_classified`**: detalle fresco (sistema) + split FUND/DIRECT_INV (`dim_bd_previa`, 100% cobertura) + atributos de fondo (97,4% de los FUND). DI clasifica por instrumento en Fase 2. Monto reconcilia al total.

**Bloat analizado**: dead-tuples negligible (autovacuum al día). Reclaim real = ~129 MB de tablas viejas (`historial_carteras_full` 62, `sp_*` 53, `historial_carteras` 13, `bbg_returns_foreign` 0,8) → dropear en **Fase 3** tras re-cablear (hoy las leen vistas live). Posibles huérfanas a verificar: `ipd_cubo_final`, `ipd_*_metrics` (~2 MB).

### 🚧 FASE 2 EN CURSO — re-cableo de vistas por sección

**Alternatives (en progreso):**
- `v_chist_aa_sd` creada (migration `fase2_v_chist_aa_sd`, paralela, no switcheada) sobre `v_chist_classified`. Mapea `tipo_valor` Valorización→`NAV`/Remanente, FX `CLFXDOOB_sindesf` por fecha_reporte (igual que la vieja).
- Validación 2026-01-31 vs vistas actuales: **Uncalled +0,1%** (15.404→…), **NAV +1,6%**, Total +1,0%. Delta NAV explicado: **+116 USD MM** = `Direct Inv. Alternativos` (inclusión intencional, el viejo lo excluía) + **+133** = refinamiento Fondos (tipo_valor vs dim_valorizacion_remanente; dentro de tolerancia).
- **+1,6% NAV explicado al 100% (2026-06-25)** — ambas partes son CORRECCIONES del modelo nuevo:
  - **+149**: fondo "Pearl Diver Floating Rate Global Income" (id 3029, Direct Lending alt). Está en ambas fuentes pero el viejo lo EXCLUYE por bug: filtra alternativos por tipo de instrumento (`dim_tipo_instrumento_filtro.filtro1='Si'`) y su instrumento `CMED` = 'No', pese a ser `asset_class='Alternative'`. El nuevo clasifica por el fondo → lo incluye bien.
  - **+116**: bucket `Direct Inv. Alternativos` (inv. directa alt, no fondo). El viejo lo excluye.
- **DECISIÓN TOMADA (usuario, 2026-06-25): mantener correcto + documentar gap** (como Aegon; ver memoria `reference_pearl_diver_gap`).
- **✅ SWITCHEADO**: `v_chist_aa` reescrito para leer de `v_chist_classified` (migration `fase2_switch_v_chist_aa_to_sql`; versionado en `sync/v_alternatives_switch.sql`). Casts a varchar(N)/numeric(p,s) para preservar esquema → los 8 consumidores (`v_nav`/`v_uncalled`/`v_total`/`v_total_c1`/`v_afp_c1`/`v_afp_c2`/`v_nav_c1`/`v_uncalled_c1`) heredan el cambio sin tocarse. Dashboard ahora: v_nav 15.654 / v_uncalled 10.224 / v_total 25.877 (2026-01-31). Sin pérdida de historia (`historial_carteras_full` también era 2025+, 13 fechas). `v_chist_classified` + `fondo`. `v_chist_aa` ya NO depende de historial_carteras_full/dim_valorizacion_remanente/dim_tipo_instrumento_filtro.
- **Pendiente Alternatives**: nota/disclaimer UI del gap vs PDF; evolución pre-2025 (agregado mensual) si se quiere historia más larga.

**Market Share ✅ (ya estaba):** `v_returns_afp_tipo` + `v_contributors_market_share` dependen solo de `valores_cuota_patrimonio` (re-origenada a VC_PAT) + `tipo_cambio` + `cotizantes_afp`. Sin tablas viejas. Fresco a 2026-05. No requirió reescribir nada.

**Strategy ✅ (rama principal, 2026-06-25):** `v_sp_strategy_aum` reescrita (DROP+CREATE, era hoja) sobre `v_consolidated_classified` (Fondos sistema). Reconciliada EXACTA vs SP en 8 periodos (±1 redondeo). Ahora fresco a 2026-05 (28.269 USD MM, 96 fondos, 11 familias). Versionado: `sync/v_strategy_switch.sql`. **Pendiente**: rama family-11 (local equity, `v_local_equity_di_vs_if_combined`).

**Chilean Stocks GICS ✅ (2026-06-25):** `v_chilean_stocks_gics` swap de fuente `historial_carteras_full` → `chist_adjusted` (acciones nacionales 'ACC'). Reconciliado EXACTO (diff=0, 6 fechas). `f_sec05_*` siguen OK (top40 devuelve 40). Mismo lag (2025+). Versionado: `sync/v_chilean_stocks_switch.sql`. **Pendiente**: `mv_chist_chilean_stocks_by_nemo` (transactions card, aún en historial_carteras_full); freshness vía consolidated_sd diferido (le falta nombre_del_emisor para el override GICS).

**Foreign 🚧 — lado CHIST SWITCHEADO ✅ (2026-06-25):**
- `v_chist_foreign_classified` reescrita en sitio (37 cols type-matched; `grupo_economico`/`unidad_de_reajuste_de_moneda` como NULL — no se usan) sobre `chist_adjusted`. Migration `fase2_switch_chist_foreign_classified`.
- Cascada: `v_chist_foreign_pdf` (auto) → `mv_foreign_pdf_summary` (REFRESH). Summary **byte-idéntico al baseline** (129.217/126.778/122.968/121.929, mismas filas). Los derivados que chist_adjusted excluye ya estaban excluidos (`WHERE pdf_bucket <> 'Excluded Derivatives'`).
- Refrescados los matviews CHIST de Foreign: `mv_chist_foreign_managers`, `mv_chist_foreign_by_fund`, `mv_chist_foreign_units_by_nemo` (data idéntica, ahora leen chist_adjusted). `v_foreign_latam_monthly` auto.
- Sanity OK: pdf_summary_combined, managers_combined, fund_flows devuelven datos.
- **Foreign lado SP — Paso 1 SWITCHEADO ✅ (2026-06-26): summary + managers off `consolidated_sd`.**
- Decisión DI tomada (usuario): **opción (a) reforzada** — `consolidated_sd` + overlay manual de DI por ISIN + backfill de los glosa-only. Motivo: `dim_ipd_instrumentos` (=BD_Instrumentos) solo cubre **12/97** nemos DI extranjeros → el overlay de DI es irreduciblemente manual, así que la ruta chist_adjusted no aporta (y costaría frescura). Mantiene Foreign todo en mundo fresco.
- Vistas paralelas creadas (migration `fase2_consolidated_foreign_parallel`; versionado en `sync/v_foreign_consolidated_switch.sql`): `v_consolidated_foreign_classified`, `v_consolidated_foreign_pdf`, `mv_consolidated_foreign_pdf_summary`, `v_consolidated_foreign_managers`. Fuente: consolidated_sd `Source IN ('25','17+25')` (cuadro 25 extranjero), nemotecnico=ISIN, monto ya USD MM. Mismo `fund_class` + overlays (`region_override`, `classification_overlay`) que las SP.
- **Reconciliación vs SP (17 meses 2024-11..2026-05): total +0.16..0.20% siempre** (consolidated marginalmente más completo, ~18 nemos FI extra/mes). Buckets 2026-04: DI +2, Equity +2, FI +187, PE +30. Managers: 173 filas ambos, diff máx por manager 140.
- **SWITCH** (migration `fase2_switch_foreign_combined_to_consolidated`): `v_foreign_pdf_summary_combined` (partes 1/4 → consolidated; parte 3 DI **sigue SP**, parte 2 CHIST fallback ahora casi muerta porque consolidated cubre 2012+) y `v_foreign_managers_combined` (consolidated + CHIST fallback). Sin dependientes DB; front lee por REST. Refrescadas `mv_sp_direct_investment_detail/summary` para que el último mes (2026-05) quede completo. Literal `'SP_XML'` conservado como token del mundo fresco (no romper `ForeignSource`); relabel honesto → diferido a repunte de freshness.
- **Bonus**: Foreign evolution ahora fresco 2012→2026 (antes SP solo 18 meses).
- DB 216→217 MB (+1.4 MB matview).

**Auditoría profunda + limpieza (2026-06-26):** mapeo empírico del grafo de dependencias (no confiar en el plan). Hallazgos nuevos: (1) **Distributors seguía en SP** — `v_distributors_sec09` leía `v_sp_foreign_classified`; **SWITCHEADO** a `v_consolidated_foreign_classified` (migration `fase2_distributors_swap_to_consolidated`; reconciliado <140 USD MM/dist; eliminada rama chist_fallback con bug latente CLP/USD). (2) **Strategy local-equity sigue en SP** (`v_local_equity_di_vs_if_combined`→`v_sp_local_equity_di_vs_if`→`v_sp_fi_local`/`v_sp_chilean_stocks_by_issuer`) → item #4. (3) `ipd_positions` (28 MB) = seeds Sec05, **KEEP**.
  **Drop de huérfanas** (migration `fase2_drop_orphan_sp_views`; versionado en `sync/v_distributors_swap_and_orphan_drops.sql`): 15 vistas leaf que pineaban sp_* sin que el front las lea — `v_chilean_stocks_by_issuer_combined`, `v_foreign_by_fund_combined`(+`v_sp_foreign_by_fund`), `mv_sp_foreign_pdf_summary`, `v_sp_foreign_pdf_summary`, `v_sp_foreign_managers`, `v_sp_asset_class_afp/dates/tipo`, `v_sp_aum_afp`, `v_sp_cartera_afp/fondo`, `v_sp_emisor_nacional`, `v_sp_extranjero_grupo`, `v_local_fi_by_afp`(non-sd). **Resultado: `sp_valor_afp` (10 MB) quedó SIN dependientes → dropear en Paso 4 con el update del sync SP.**
  Consumidores SP reales restantes (grafo actualizado): flows (Paso 2), DI (Paso 3), Strategy local-equity (item #4), freshness (Paso 4). DB 217 MB.

**PENDIENTE Foreign (lado SP):**
  - **Paso 2 ✅ SWITCHEADO (2026-06-26)** — Flows/returns Bloomberg migradas. `v_foreign_returns_flows`: posiciones `v_sp_foreign_pdf`→`v_consolidated_foreign_pdf`; returns `bbg_returns_foreign`→`bbg_returns`. Descubierto: `bbg_returns` = `bbg_returns_foreign` con columnas renombradas (`fecha`→`end_date`, `nemo`→`nemo_sp`, `ret_usd_pct`→`usd_ret`, +`start_date`), mismos datos; join por `nemo_sp` (cobertura 402 vs 401 = idéntica); `usd_ret` es % (÷100). **Flows ahora a 2026-05** (antes 2026-03). Parity 2026-03 vs viejo: change/return/flow todos +0.1–0.2%. Matviews refrescadas. Versionado `sync/v_foreign_flows_switch.sql` (migration `fase2_foreign_flows_to_consolidated_bbg`). Cadena SP-foreign huérfana dropeada (`v_sp_emisor_extranjero/classified/pdf`, migration `fase2_drop_orphan_sp_foreign_chain`). **`bbg_returns_foreign` ahora solo lo usa `v_module_freshness`.**
  - **Paso 3 ✅ SWITCHEADO (2026-06-26)** — DI detail/summary migrados a `consolidated_sd`. **Investigación profunda**: los 26 "glosa-only" = (a) **22 contrapartes bancarias de derivados** (cuadro 25 filas 76-88, sin ISIN, +/- nets, net −564 USD MM/mes) que consolidated **excluye con razón** (son MTM de forwards/swaps FX, NO inversión directa; ya están en AA Foreign Derivatives −2,096; meterlas en DI sería doble conteo) + (b) **exactamente 4 bonos reales** (IFC×3, EBRD×1, +62) en toda la historia → **backfilleados como filas ISIN-keyed** en `dim_direct_investment_overlay`. `v_sp_direct_investment_detail` reescrita sobre consolidated (overlay por ISIN, dedup); matviews `mv_sp_direct_investment_detail/summary` solo refrescadas (combined + front sin tocar). **DI @2026-05 = 5,304 (vs SP 4,739); gap +565 = 100% las contrapartes de derivados.** Foreign total 136,362→136,928. DI fresco a 2026-05. Versionado `sync/v_foreign_di_switch.sql`. **DI ya no toca `sp_*`.** ⚠️ **UI disclaimer pendiente**: DI excluye nets de contraparte de derivados (~−560/mes, en AA), bucket DI ~+12% sobre PDF.
  - **Paso 4** — Fase 3: drop `sp_*` (~53 MB) + `bbg_returns_foreign`; repuntar `v_module_freshness` + relabel source.
  - Overlays EM/DM (`classification_overlay`, pega en 900/923 isins, SOBRE-ESCRIBE BD_Funds): **mantenidos**, validar retiro por separado vs PDF (riesgoso).

**Strategy local-equity ✅ SWITCHEADO (2026-06-26, item #4)** — `v_sp_local_equity_di_vs_if` (Local Equity DI vs IF, CLP bn) reescrita sobre `consolidated_sd`: `direct_clp_bn` = Source 09 (DIRECT_INV nacional = equity, no hay FI directa nacional) × USDCLP month-end; `funds_clp_bn` = Source 17 (FUNDs nacionales, asset_class=Equity & region=Chile) × FX. Split 09/17 verificado vía `dim_bd_previa` (09=100% DIRECT_INV, 17=100% FUND). Reconciliado vs rama SP (2026-02..05): direct +0.06–0.22%, **funds exacto**. Combined `v_local_equity_di_vs_if_combined` sin cambios (CHIST historia + esta vista tail fresco; seam FX +1.8% CHIST-vs-USD×FX preexistente). Dropeadas huérfanas `v_sp_chilean_stocks_by_issuer` + `v_sp_fi_local`. Versionado `sync/v_strategy_local_equity_switch.sql`. **🎯 `sp_valor_fondo`/`sp_valor_instrumento`/`sp_valor_afp` ahora con CERO dependientes; `sp_*` pineado SOLO por `v_module_freshness`.**

**Paso 4 ✅ COMPLETO (2026-06-26) — Freshness repunte + reclaim final:**
  - `v_module_freshness` repunteada off `sp_fila`/`bbg_returns_foreign`/`historial_carteras` → `consolidated_sd`/`bbg_returns`/`chist_adjusted` (`ipd_positions` se mantiene = seed Sec05). `published_date`→NULL en filas consolidated; labels sin cambiar (relabel honesto = follow-up UI). Migration `fase4_freshness_repoint_off_sp`.
  - **DROPEADAS** `sp_fila`/`sp_valor_fondo`/`sp_valor_afp`/`sp_valor_instrumento` + `bbg_returns_foreign` + `historial_carteras` (cero dependientes; recuperables de SQL Server). Migration `fase4_drop_sp_and_legacy_tables`. **DB 221→155 MB.** Sanity cruzado de todas las cards OK. Versionado `sync/v_freshness_repoint_and_reclaim.sql`.
  - **Scripts actualizados** para no escribir a tablas dropeadas: `sync_sp_sqlserver_to_supabase.py` (`SYNC_SP_TABLES=False`, cotizantes sigue), `sync_sqlserver_to_supabase.py` (`sync_historial_carteras()` desactivado + fuera de print_summary), `sync_bbg_returns_to_supabase.py` (deprecado/auto-bloqueo).

### 🎉 INICIATIVA "SQL FUENTE ÚNICA" — COMPLETA (2026-06-26)
Todo el dashboard corre sobre SQL Server vía Supabase (`consolidated_sd`/`chist_adjusted`/`bbg_returns`/`vc_pat`/`sd_*`/`dim_*`). **`sp_*` y `historial_carteras` eliminadas; SP XML mirror apagado** (SQL Server AFP_CL_SP_* intacto como fuente). DB ~280→**155 MB**.

**Follow-ups (no bloqueantes, UI/diferidos):**
  - Relabel honesto del token `'SP_XML'`→ mundo fresco en el front (cosmético).
  - **UI disclaimer** del gap DI (contrapartes de derivados, ~+12%) — estilo Pearl Diver/Aegon.
  - CLAUDE.md: actualizar la sección "SP data two-hop" (el mirror sp_* ya no existe).
  - Diferidos previos siguen: Sec05 seeds a SQL (#4), mapeo distribuidor a SQL (#6), auditar DIM_BD_* renames (#7), retiro overlays EM/DM (validar vs PDF).

**🎉 `historial_carteras_full` LIBERADA Y DROPEADA (2026-06-25, −62 MB: 278→216 MB).** Migrados sus 5 consumidores restantes a `chist_adjusted`:
- `v_distributors_sec09` (chist_fallback) ✅ — **Distributors migrada** (mapeo distribuidor sigue overlay manager-level, pendiente #6).
- `mv_chist_chilean_stocks_by_nemo` (transactions) ✅.
- `mv_chist_chilean_stocks_by_issuer` + cascada (`v_chist_chilean_stocks_by_issuer`, `v_chilean_stocks_by_issuer_combined`) ✅.
- `mv_chist_local_equity_di_vs_if` + cascada → **Strategy family-11 (local equity) migrada** ✅.
- `v_module_freshness` ✅ (5 refs → chist_adjusted).
- Sanity cruzado OK (by_issuer 27.212 USD = gics; by_nemo 23.771 CLP bn = local_equity direct).
- Migrations: `fase2_distributors_to_chist_adjusted`, `fase2_mv_by_nemo_to_chist_adjusted`, `fase2_mv_by_issuer_cascade`, `fase2_mv_local_equity_cascade`, `fase2_freshness_to_chist_adjusted`, `fase3_drop_historial_carteras_full`.

**Reclaim pendiente (Fase 3):** `sp_*` (~53 MB, lado SP foreign aún los usa), `historial_carteras` (13 MB, solo `v_module_freshness`), `bbg_returns_foreign` (0,8 MB).

**Huérfanas `ipd_*` DROPEADAS** (migration `drop_orphan_ipd_metrics`): `ipd_cubo_final`, `ipd_jpm_cembi_metrics`, `ipd_risk_america_metrics`. `dim_mkt_cap_chilean` se mantiene (seed Sec05).

## Riesgos / pendientes abiertos

1. **Storage `chist_adjusted`** — RESUELTO: ventana 2025+ sin derivados ni FI/Disp nacional ≈ **37 MB**. Supabase hoy usa 199/500 MB; estado final ≈ 157 MB tras retirar tablas viejas (~343 MB libres). Detalle full-history futuro = Supabase Pro.
2. **Overlays foreign** — confirmar en Fase 2 si `dim_bd_funds.Region` cubre EM/DM y sub-región vs PDF, o si hay que conservarlos.
3. **`dim_chilean_ticker_homol`** sigue siendo tabla manual sin seed versionado (hueco conocido).
4. **Cobertura SP**: confirmar que `consolidated_sd` reemplaza 100% lo que hoy da `sp_*` antes de apagar el scraper XML (cotizantes sí o sí se mantiene).
5. **Sec05 seeds** a SQL — Fase 4, no olvidar.
6. **Mapeo distribuidor (manager → distributor)** — hoy `dim_distributor_by_manager` manual en Supabase; `BD_FUNDS.Distributor` está vacía. Para cerrar "solo SQL" hay que llevar este mapeo a SQL. Diferido junto con Sec05.
7. **Auditar dims `DIM_BD_*` por columnas renombradas** — el modelo nuevo renombró `DIM_BD_FUNDS_2_INTMDO.Fondo`→`Fund` (el sync estaba roto, corregido 2026-06-25). Otros `DIM_BD_*` pueden tener renames similares → revisar antes de confiar en sus syncs.
