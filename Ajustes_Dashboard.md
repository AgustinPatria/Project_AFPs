# Ajustes — Plataforma BI de Datos

> Lista de cambios consolidada a partir del feedback del equipo. Pensada para ser ejecutada por Claude Code.

## Contexto del proyecto

Dashboard de BI para análisis de datos de **AFPs** (fondos de pensiones). Módulos principales: **Asset Allocation**, **Market Share**, **Alternative Assets**, **Strategy**, más gráficos específicos y temas transversales de UX/UI. Los términos financieros se mantienen en inglés porque corresponden a las etiquetas reales de la interfaz (OW/UW, Asset Class, Market Share, etc.).

## Cómo usar este documento (instrucciones para Claude Code)

1. Antes de codear, explora la estructura del repo e identifica qué componente/archivo corresponde a cada módulo. Confírmame el mapeo si no es evidente.
2. Aborda **una tarea a la vez** y valida el resultado antes de pasar a la siguiente.
3. Respeta el **orden de ejecución recomendado** del final (primero los bugs de correctitud, luego features de alto valor, luego cosméticos).
4. Cada tarea indica:
   - **Tipo:** `Bug` (corregir error existente) · `Mejora` (mejorar algo que ya existe) · `Feature` (funcionalidad nueva) · `Verificar` (revisar lógica y reportar, no necesariamente cambiar).
   - **Prioridad:** `Alta` / `Media` / `Baja`.
   - **Actual** (cuando aplica) y **Esperado**.
5. Si una tarea es ambigua o requiere un supuesto de negocio, **pregúntame antes** de implementar.

---

## Módulo 1 — Asset Allocation

> Sección con más comentarios. Patricio aclaró que parte de esta información ya la venía trabajando el área de Inteligencia, por lo que en varios puntos se trata principalmente de **incorporar** lo existente. Referencia visual de Sebastián: "Asset Class Distribution / OW · UW vs System".

### 1.1 — Corregir lógica de OW/UW vs System
- **Tipo:** Bug · **Prioridad:** Alta (marcado como *clave*)
- **Actual:** Todos los fondos de todas las AFP aparecen OW (valores positivos) respecto al sistema.
- **Esperado:** Por construcción algunos fondos deben estar OW y otros UW respecto al sistema; es imposible que todos estén OW. Revisar el cálculo (probable error de signo, de referencia del "sistema", o de la base contra la que se compara).

### 1.2 — Poblar 'Active bets vs system'
- **Tipo:** Bug · **Prioridad:** Alta
- **Actual:** El campo/columna 'Active bets vs system' aparece en blanco.
- **Esperado:** Debe mostrar los datos correspondientes.

### 1.3 — Extender la tabla OW/UW vs System a todas las clases de activo
- **Tipo:** Bug/Feature · **Prioridad:** Alta (marcado como *clave*)
- **Actual:** La tabla OW/UW vs System solo está disponible para algunas clases de activo.
- **Esperado:** Debe estar disponible para **todas** las clases de activo.

### 1.4 — Agregar OW/UW por AFP en nuestros fondos
- **Tipo:** Feature · **Prioridad:** Media
- **Esperado:** Mostrar el OW/UW de **cada AFP** dentro de nuestros fondos (desglose por AFP, no solo el agregado).

### 1.5 — Reorganizar la tabla por clase de activo con total destacado
- **Tipo:** Mejora · **Prioridad:** Media
- **Esperado:** Tabla organizada por clase de activo, con la **línea de total** destacada de forma distinta al resto. Estructura de ejemplo:
  - Equities / Fixed Income / Alternatives
  - Dentro de cada una: Local / Foreign

### 1.6 — Selector por AFP en "Asset allocation over time"
- **Tipo:** Feature · **Prioridad:** Media
- **Esperado:** En el gráfico "Asset allocation over time", permitir escoger/filtrar por AFP.

### 1.7 — Incorporar análisis de "Foreign Investments Changes"
- **Tipo:** Feature · **Prioridad:** Media
- **Esperado:** Mostrar hacia dónde se están yendo los flujos, comparando último mes vs. últimos 3 meses, 6 meses, etc.

### 1.8 — Incorporar "Top Net Inflows and Outflows — Foreign Funds"
- **Tipo:** Feature · **Prioridad:** Media
- **Esperado:** Mapear a qué fondos en particular se están yendo los flujos (complementa el punto 1.7).

### 1.9 — Ver Asset Class Distribution en porcentaje
- **Tipo:** Mejora · **Prioridad:** Baja
- **Esperado:** Permitir ver Asset Class Distribution también en **% ** como vista alternativa (se considera más amigable de leer).

---

## Módulo 2 — Market Share

### 2.1 — Fijar las columnas estáticas de la tabla
- **Tipo:** Bug · **Prioridad:** Alta
- **Actual:** Las columnas estáticas cambian de posición al seleccionar otro toggle.
- **Esperado:** Las columnas estáticas deben permanecer **fijas** (no moverse) al cambiar de toggle.

### 2.2 — Mostrar % de market share por defecto
- **Tipo:** Mejora · **Prioridad:** Media
- **Esperado:** Que por defecto se muestren los **porcentajes** de market share.

### 2.3 — Selector de fechas en Returns
- **Tipo:** Feature · **Prioridad:** Media
- **Esperado:** En la vista de Returns, agregar un selector de fechas para escoger manualmente el rango.

---

## Módulo 3 — Alternative Assets

### 3.1 — Agregar currency y notación de magnitud (MM / M)
- **Tipo:** Mejora · **Prioridad:** Media
- **Esperado:** Mostrar la moneda e indicar si las cifras están en **MM** o en **M**, replicando lo que ya se hizo en Market Share.

### 3.2 — Arreglar overflow del selector de fechas
- **Tipo:** Bug · **Prioridad:** Media
- **Actual:** El selector de fechas presenta overflow.
- **Esperado:** Corregir el overflow para que se renderice correctamente.

### 3.3 — Detalle por multifondo en Summary AFP
- **Tipo:** Feature · **Prioridad:** Media
- **Esperado:** En "Summary AFP", al hacer click en una AFP, mostrar el detalle desglosado por **multifondo (A, B, C, D, E)**.

### 3.4 — Mover la pestaña en el menú lateral
- **Tipo:** Mejora · **Prioridad:** Baja
- **Esperado:** Mover la pestaña "Alternative Assets" hacia abajo en el menú del lado izquierdo.

---

## Módulo 4 — Strategy

### 4.1 — Cartera y contribuidores del retorno por estrategia ✅ (2026-07-01)
- **Tipo:** Feature · **Prioridad:** Media
- **Esperado:** Para cada estrategia (por ejemplo, **MDLATHY**), permitir ver la cartera y el análisis de los principales contribuidores del retorno del **último mes o trimestre**.
- **Implementado:** cards "Return contributors" (toggle 1M/3M, desglose Price + FX/carry, reconciliación vs cuota oficial con residual income/cash) y "Portfolio" (cartera EOM top 15 + expandir) por fondo Moneda de cada familia en `/strategy`. Fuente: `TBL_IPA_V2` diaria (Inteligencia_Producto) agregada mensualmente por `sync/sync_ipd_strategy.py`; metodología validada contra el piloto `TBL_PERFORMANCE_ATTRIBUTION` (MSCLUX ene-2025: 10,59% calc vs 10,97% oficial). Excepción: familia 9 (CLO, MCCDF) sin posiciones en IPD — pedir onboarding a Producto.

### 4.2 — Mostrar rentabilidad de los fondos (correlación rentabilidad/AUM) ✅ (2026-07-01)
- **Tipo:** Feature · **Prioridad:** Media
- **Esperado:** Agregar la rentabilidad de esos fondos al costado, de modo de poder visualizar la **correlación rentabilidad / AUM**.
- **Implementado:** card "Return vs AUM" por fondo Moneda: tabla MTD/YTD/1Y serie vs benchmark + gráfico combinado retorno mensual (barras) / AUM (línea). Fuente: `TBL_RENTABILIDADES_SERIES` → `ipd_rentabilidades`. Peers del universo strategy siguen sin serie de retornos (BBG_Returns no los cubre; 5/115).

---

## Módulo 5 — Gráficos y visualizaciones específicas

### 5.1 — Gráfico "Limits per Fund Type": promedio de 90 días ✅ (verificado 2026-07-01)
- **Tipo:** Mejora · **Prioridad:** Media
- **Esperado:** Mostrar los últimos 3 meses o una **línea de promedio de los últimos 90 días**, para dimensionar cuánto sería el ajuste a realizar.
- **Implementado:** línea punteada ámbar por fondo = promedio de los últimos 3 cierres mensuales (≈90 días, data `v_asset_class_tipo_sd` es mensual), dibujada sobre las barras junto al máximo regulatorio DL 3500 (línea roja); la brecha ámbar→roja dimensiona el ajuste. Toggle **Quarterly / Last 3 months** para las barras (últimos 4 cierres trimestrales o los mismos 3 meses de la ventana del promedio) — cubre las dos alternativas del pedido. Leyenda explica ambas líneas y lista los topes por fondo. Verificado con data a may-2026: headroom equity A 5,4pp · B 4,4 · C 4,1 · D 2,5 · E 1,8; foreign A 7,3 · B 11,6 · C 22,5 · D 10,4 · E 23,1.

### 5.2 — Verificar tratamiento de las series de SQM ✅ (2026-07-01)
- **Tipo:** Verificar · **Prioridad:** Baja
- **Contexto:** Para acciones locales con distintas series, el caso actual **asume que la posición de SQM consolida ambas series y muestra solo una como nemo**.
- **Acción:** Revisar la lógica y **confirmar** si efectivamente es así; reportar el hallazgo antes de hacer cualquier cambio.
- **Resuelto:** confirmado que consolida por emisor (correcto, 2.949 USD MM rk#2); el nemo mostrado era `MIN()` alfabético (SQM-A). Al reescribir `f_sec05_top40` para la migración a SQL vivo se aplicó el fix: el nemo mostrado es el de **mayor monto** de la compañía (SQM-B, ~98%).

---

## Módulo 6 — UX/UI (transversal)

### 6.1 — Color fijo por AFP
- **Tipo:** Mejora · **Prioridad:** Media
- **Esperado:** Asignar a cada AFP su **color** propio y mantenerlo consistente en todo el dashboard.

### 6.2 — Color consistente por clase de activo
- **Tipo:** Mejora · **Prioridad:** Baja
- **Esperado:** Aplicar el mismo criterio de color consistente por clase de activo.

---

## Orden de ejecución recomendado

**Fase 1 — Bugs de correctitud (hacer primero):**
1. `1.1` Lógica OW/UW vs System
2. `1.3` Tabla OW/UW para todas las clases de activo
3. `1.2` 'Active bets vs system' en blanco
4. `2.1` Columnas de Market Share que se mueven
5. `3.2` Overflow del selector de fechas (Alternative Assets)

**Fase 2 — Features y mejoras de alto valor:**
6. `1.4` OW/UW por AFP
7. `1.5` Tabla por clase de activo con total destacado
8. `1.6` Selector por AFP en allocation over time
9. `1.7` Foreign Investments Changes
10. `1.8` Top Net Inflows and Outflows
11. `2.2` % de market share por defecto
12. `2.3` Selector de fechas en Returns
13. `3.1` Currency + MM/M en Alternative Assets
14. `3.3` Detalle por multifondo en Summary AFP
15. `4.1` Cartera y contribuidores por estrategia
16. `4.2` Rentabilidad / correlación AUM
17. `5.1` Promedio 90 días en "Limits per Fund Type"
18. `6.1` Color fijo por AFP

**Fase 3 — Cosméticos y verificaciones:**
19. `1.9` Asset Class Distribution en %
20. `3.4` Mover pestaña Alternative Assets
21. `6.2` Color por clase de activo
22. `5.2` Verificación de series de SQM
