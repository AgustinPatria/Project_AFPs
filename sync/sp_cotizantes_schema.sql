-- =============================================================
-- Tabla cotizantes_afp
-- Fuente: Superintendencia de Pensiones, "3. Numero de cotizantes Totales"
--   https://www.spensiones.cl/apps/centroEstadisticas/paginaCuadrosCCEE.php
--     ?menu=sci&menuN1=cotycot&menuN2=afp
-- Cargada via sync/sync_sp_cotizantes.py (rolling 4 meses).
-- =============================================================

create table if not exists public.cotizantes_afp (
    fecha           date    not null,   -- ultimo dia del periodo (e.g. 2026-02-28)
    afp             text    not null,   -- CAPITAL/CUPRUM/HABITAT/MODELO/PLANVITAL/PROVIDA/UNO
    n_cotizantes    integer not null,
    primary key (fecha, afp)
);

create index if not exists idx_cotizantes_afp_fecha on public.cotizantes_afp(fecha);

comment on table public.cotizantes_afp is
    'Cotizantes mensuales por AFP scrapeados de SP. PK (fecha, afp). '
    'Solo guardamos las 7 AFPs (excluye fila TOTAL).';

-- =============================================================
-- Vista v_contributors_market_share
-- Para cada fecha de v_returns_afp_tipo (cierre de mes del reporte) toma el
-- ultimo snapshot de cotizantes publicado ANTES del mes del reporte. Esto
-- reproduce la convencion del PDF interno ("Contributors data as of 31-10-2025"
-- para el reporte de 30-Nov-2025) — siempre se usan los cotizantes del cierre
-- del mes anterior al reporte, aunque los del mismo mes ya esten publicados.
-- =============================================================

create or replace view public.v_contributors_market_share as
with aum_by_afp as (
    select fecha, afp, sum(aum_usd_mm) as aum_usd_mm
    from public.v_returns_afp_tipo
    where afp <> 'TOTAL'
    group by fecha, afp
),
joined as (
    select
        a.fecha as fecha_reporte,
        a.afp,
        a.aum_usd_mm,
        c.fecha as fecha_cotizantes,
        c.n_cotizantes
    from aum_by_afp a
    left join lateral (
        select fecha, n_cotizantes
        from public.cotizantes_afp ca
        where ca.afp = a.afp
          and ca.fecha < date_trunc('month', a.fecha)::date
        order by ca.fecha desc
        limit 1
    ) c on true
)
select
    fecha_reporte,
    fecha_cotizantes,
    afp,
    aum_usd_mm,
    n_cotizantes,
    -- "AVG (USD M)" en el PDF = AUM_USD / # cotizantes, expresado en miles de USD/cotizante.
    case when n_cotizantes > 0
        then aum_usd_mm * 1000.0 / n_cotizantes
    end as avg_usd_per_cotiz,
    -- shares calculados a nivel de sistema (excluye filas sin cotizantes para cuadrar 100%)
    aum_usd_mm / nullif(sum(aum_usd_mm) over (partition by fecha_reporte), 0)
        as share_aum,
    n_cotizantes::numeric
        / nullif(sum(n_cotizantes) over (partition by fecha_reporte), 0)
        as share_cotiz
from joined;

comment on view public.v_contributors_market_share is
    'Market Share by Amount + by # Contributors per AFP for each report date. '
    'fecha_cotizantes = ultimo cierre de mes anterior al fecha_reporte (PDF parity).';
