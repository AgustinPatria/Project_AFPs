# Sección 05 — Chilean Stocks Portfolio · Plan de pipeline automático

Plan de migración de la sección 05 del reporte interno (`05 202511 Chilean
Stocks Portfolio.pdf`) a un pipeline 100% automático en Supabase + dashboard.
Fecha del plan: 2026-05-22.

Objetivo de diseño: **cero pasos manuales recurrentes** en la carga mensual.
Lo único manual es setup de una sola vez (entitlement Bloomberg, confirmar la
regla del cuartil).

> **Decisión 2026-05-22:** el plan se ejecuta en dos fases. La **Fase A** (ver
> §6) avanza con todo lo construible con data ya sincronizada — sin extracciones
> únicas ni datos que se degraden. La **Fase B** queda parkeada porque depende de
> Bloomberg, una fuente externa aún no disponible. Hasta la Fase B quedan fuera
> la columna IPSA, la tabla IPSA/NO IPSA y la tabla Quartile (las tres dependen
> de Bloomberg).

---

## 1. Qué contiene la sección 05

El PDF tiene **5 tablas**, todas con **4 columnas**: `PIONERO`, `MRV`, `IPSA`,
`AFPs`.

1. **Quartile** — peso del portafolio por cuartil (Q1–Q4 + Other).
2. **GICS Sector** — peso por sector GICS (11 sectores).
3. **Concentración** — # de compañías, Top 10 / 20 / 30 posiciones.
4. **IPSA / NO IPSA** — peso dentro vs. fuera del índice.
5. **Top 40 Chilean Companies** — ranking de la columna AFPs.

`PIONERO` y `MRV` son fondos de acciones chilenas de Moneda; `IPSA` es el
índice; `AFPs` es la tenencia agregada de acciones chilenas de las AFP.

---

## 2. Cómo lo arma el Excel legacy (`20_Cartera_Acc_Chilenas.xlsm`)

Todas las tablas de la hoja `Portfolio` (que es la página del PDF) son
`SUMIF` / `RANK` sobre una sola hoja **`Todos`**, que tiene una fila por acción
y cruza **4 vectores de peso** contra **una dimensional**:

```
BDChile (dimensional maestra) ─┐
  nemo · ticker BBG · GICS ·   │
  CUARTIL · compañía · grupo   │
                               ├─► Todos (1 fila/acción) ─► Portfolio (5 tablas)
Pionero  (nemo → peso)  ────────┤     W=Pionero X=MRV
MRV      (nemo → peso)  ────────┤     Y=IPSA   Z=AFP
IPSA     (ticker → peso) ───────┤     AB=cuartil AA=GICS AC=flag IPSA
AuxAFP   (compañía → peso) ─────┘
```

Las uniones usan **claves distintas** — importante para el pipeline:

- **Pionero / MRV** se unen por `nemotécnico`.
- **IPSA** se une por `ticker Bloomberg`.
- **AFPs** se une por `nombre de compañía`.
- **`BDChile`** es el puente: tiene las tres claves.

Lógica de cada tabla:

- **Quartile** = `SUMIF` por `Todos!AB` (cuartil). El cuartil sale de `BDChile`
  columna F — valores `{1,2,3,4,"Other"}`.
- **GICS** = `SUMIF` por nombre de sector GICS (`BDChile` columna J).
- **IPSA / NO IPSA** — el flag es **a nivel compañía, no a nivel ticker**. Una
  compañía cae en IPSA si CUALQUIERA de sus share classes está en el índice
  (ej: `ANDINA-A` queda IPSA porque `ANDINA-B` está en IPSA, aunque
  `ANDINAA CI Equity` no esté). La hoja `Todos` resuelve esto con la columna 5
  ("compañía") y propaga el flag al primer nemo de cada compañía.
- **# companies / Top N** = `RANK` sobre los pesos.
- **Top 40** = ranking de la columna AFPs, **agrupado por compañía** (no por
  nemo) via la hoja `AuxAFP`.

La macro VBA del Excel **solo exporta PDFs** — no importa datos. Las hojas
`Pionero` (link externo a `\\moneda03\...\PIONERO\`), `MRV` e `IPSA` se pegan a
mano. La hoja `Mkt_Cap` (`Fecha | TickerBBG | MKT_CAP`) también se pega desde
Bloomberg.

---

## 3. Los 5 insumos y su fuente automática

| Insumo | Hoja Excel | Fuente automática | Estado |
|---|---|---|---|
| Pesos **AFPs** | `AuxAFP` | CHIST → `historial_carteras_full` | ✅ sync existe |
| Pesos **Pionero** | `Pionero` | `ipd_positions` id_fund **33** | ✅ sync existe |
| Pesos **MRV** | `MRV` | `ipd_positions` id_fund **19** | ✅ sync existe |
| Pesos **IPSA** | `IPSA` | Bloomberg `BDS("IPSA Index","INDX_MWEIGHT")` | 🔨 sync a construir |
| Market cap (cuartil) | `Mkt_Cap` | Bloomberg `BDP(...,"CUR_MKT_CAP")` | 🔨 sync a construir |
| GICS sectores | `BDChile` col J | `dim_ipd_gics` + `dim_ipd_instrumentos` | ✅ sync existe |

### Hallazgos clave (2026-05-22)

- **Pionero y MRV NO son un gap.** Ambos están sincronizados como fondos Moneda
  en `ipd_positions` (Pionero id 33, MRV id 19). El `PIPELINE_DATA_GAPS.md §2.3`
  estaba desactualizado al asumir que Pionero solo vivía en el network share.
  Caveat: hoy `ipd_positions` tiene fechas dispersas y **no captura cierre de
  mes** — el sync hay que ajustarlo.
- **Composición IPSA → Bloomberg.** Confirmado que no está en SQL Server: se
  revisaron las 107 tablas de `Inteligencia_Producto_Dev`. Existe un schema
  `stock.*` (`stock.benchmarks`, `stock.companias`, `stock.instrumentos`) que
  parece hecho para esto, pero está **vacío**. Ver `PIPELINE_DATA_GAPS.md §2.1`.
- **El cuartil es derivable de market cap.** En `BDChile` el cuartil es un valor
  estático, pero la existencia de la hoja `Mkt_Cap` (Bloomberg) y el patrón del
  PDF (IPSA = compañías grandes, todas en Q1–Q3, sin Q4 ni Other; Pionero =
  small caps, repartido hasta Q4/Other) indican que el cuartil es un **cuartil
  por market cap**. Por confirmar la regla exacta y los umbrales.

---

## 4. Arquitectura del pipeline automático

Dos cambios respecto al enfoque inicial, para eliminar todo paso manual:

1. **`BDChile` deja de ser una tabla mantenida a mano → pasa a ser una VISTA
   derivada.** El cuartil/GICS/flag IPSA se calculan desde fuentes sincronizadas.
2. **Se agrega un componente nuevo: `sync_bloomberg.py`** (`blpapi`), que cubre
   de una vez la composición IPSA, el market cap para el cuartil, y el Mkt_Cap
   de ADRs (gap §2.1 del docx).

### La dimensional como vista — sin mantenimiento manual

`v_chilean_stocks_dim` se calcula sola en cada corrida:

- **nemo · ticker BBG · GICS** ← `dim_ipd_instrumentos` (universo completo)
- **cuartil** ← `NTILE` / umbrales sobre market cap de Bloomberg
- **flag IPSA** ← pertenencia a `dim_ipsa_composition`

Una acción chilena nueva en CHIST se clasifica **automáticamente** (Bloomberg ya
trae su market cap y GICS). La vista `v_chilean_stocks_unmapped` queda solo como
**monitoreo**, no como un gate manual.

### Flujo mensual — 100% automático

```
job mensual:
  1. sync_sqlserver_to_supabase.py   (CHIST → columna AFPs)
  2. sync_inteligencia_producto.py   (ipd_positions → Pionero/MRV)
  3. sync_bloomberg.py               (composición IPSA + market cap)
  4. REFRESH de vistas materializadas
  5. check v_chilean_stocks_unmapped (alerta si algo no clasificó)
```

---

## 5. Prerrequisitos de una sola vez (setup, no proceso recurrente)

Aplican a la **Fase B** (ver §6) — están parkeados:

1. **Acceso programático a Bloomberg.** Es el prerrequisito duro de la Fase B.
   `blpapi` necesita un entitlement: o Bloomberg Desktop API (requiere terminal
   abierta y logueada en la máquina del job) o, para ser headless de verdad,
   **Server API / B-PIPE / Data License** (entitlement pagado). Sin esto, IPSA y
   market cap no se pueden automatizar. **Decisión pendiente: qué tipo de acceso.**
2. **Confirmar la regla del cuartil.** Una pregunta a quien mantiene el reporte:
   ¿cuartil por market cap?, ¿qué umbrales?, ¿qué define "Other"? Se hardcodea
   una vez y deja el cuartil auto-derivable.

---

## 6. Plan en dos fases

**Decisión 2026-05-22:** se posponen las partes que dependen de Bloomberg (data
externa no disponible aún). Se avanza primero con lo construible con data ya
sincronizada.

### Paso 1 ✅ — Confirmar la fuente del IPSA

Hecho: no está en SQL Server, va por Bloomberg. Documentado en
`PIPELINE_DATA_GAPS.md §2.1`.

No se extrae `BDChile` del Excel. Verificado 2026-05-22: `dim_ipd_instrumentos`
(ya sincronizada) tiene 307 acciones chilenas, todas con `sector_gics`,
`ticker_bbg` y `company_name`. Una extracción única del Excel sería un snapshot
congelado que se degrada (IPOs nuevos no aparecen; el cuartil deriva solo). Por
eso 4 de las 5 columnas de `BDChile` se **derivan como vista** desde fuentes
sincronizadas, y la única huérfana (el cuartil) se pospone a la Fase B.

### Fase A — sin dependencias externas (ahora)

Cubre las columnas **PIONERO, MRV, AFPs** y 3 de las 5 tablas (GICS,
Concentración, Top 40).

- **A1** — Construir `v_chilean_stocks_dim`: dimensional **derivada como vista**
  sobre `dim_ipd_instrumentos` (nemo, ticker BBG, GICS, compañía). Sin extracción
  manual; los IPOs nuevos entran solos vía el sync. Reconciliar/consolidar con
  `dim_chilean_ticker_homol`.
- **A2** — ✅ Investigado 2026-05-22. **`extract.IPA` no tiene historia ni
  cierres de mes**: solo 3 fechas (`2025-10-24`, `2025-12-25`, `2025-12-26`), y
  `process.CUBO_Final` solo 1 (`2025-12-26`). Son extracts transitorios, no un
  time series. No es un bug del sync — la limitación está en la fuente. El
  cierre de mes real que usa el legacy viene de los archivos mensuales
  `\\moneda03\...\PIONERO\` (§2.3), una fuente distinta de Geneva/IPA.
  **Decisión Fase A:** las columnas Pionero/MRV usan el snapshot más reciente de
  `ipd_positions`, sin alinear a cierre de mes. `v_chilean_stocks_portfolio` NO
  fuerza una fecha común — cada columna muestra su dato más reciente. Conseguir
  cierres de mes / historia es trabajo fuera de Fase A (coordinar con el equipo
  de Producto que corre el IPA, o sincronizar los archivos del network share).
- **A3** — Vistas:
  - ✅ `v_chilean_stocks_moneda_funds` — pesos Pionero/MRV desde `ipd_positions`
    (creada 2026-05-22; dedup por `MAX(id_ejecucion)`, filtro COMMON/PREFERRED
    STOCK + CLP, mapeo invest_id→compañía vía homol con fallback directo a ticker
    BBG — 0 gaps). Validada: pesos suman 100%, PIONERO 26 compañías = PDF; GICS
    con varios sectores exactos. Parity exacta bloqueada por A2 (sin snapshot de
    cierre de mes — el PDF es Nov-25 y `ipd_positions` solo tiene Oct/Dic).
  - ⏳ Extender la columna AFPs (`v_chilean_stocks_gics` ya existe).
  - ⏳ `v_chilean_stocks_portfolio` — réplica de la hoja `Todos`, 3 columnas.
- **A4** — Vista de monitoreo `v_chilean_stocks_unmapped`.
- **A5** — Dashboard `/chilean-stocks`: 3 columnas, 3 tablas.

### Fase B — requiere Bloomberg (parkeado)

- **B1** — Asegurar acceso programático a Bloomberg + confirmar la regla del
  cuartil (ver §5).
- **B2** — Construir `sync_bloomberg.py` → tablas `dim_ipsa_composition` +
  `mkt_cap_chilean`.
- **B3** — Agregar la columna **IPSA** a las 5 tablas + la tabla **IPSA / NO IPSA**.
- **B4** — Agregar el **cuartil** (derivado de market cap) a `v_chilean_stocks_dim`
  y la tabla **Quartile**.
- **B5** — Orquestar el job mensual completo.

### Limitación temporal de la Fase A

La columna **IPSA**, la tabla **IPSA / NO IPSA** y la tabla **Quartile** quedan
fuera hasta la Fase B (todas dependen de Bloomberg). La Fase A no tiene ninguna
carga manual única ni dato que se degrade.

---

## 7. Caveats

- `dim_bd_funds.id` es VARCHAR; `dim_ipd_*` son INT. Joins requieren `::text`.
- `ipd_positions` es ventana rolling de 3 meses — para charts evolutivos hay que
  ampliar la historia.
- Las claves de join difieren (nemo / ticker BBG / nombre compañía); la
  dimensional `v_chilean_stocks_dim` es el puente obligatorio.
- Ya existe `dim_chilean_ticker_homol` (75 stocks) alimentando el actual
  `v_chilean_stocks_gics`. Al construir `v_chilean_stocks_dim` hay que decidir
  si se consolida o se reemplaza, para no tener dos fuentes de verdad.
