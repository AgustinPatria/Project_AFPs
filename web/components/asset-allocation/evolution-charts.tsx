'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Rectangle,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { type AssetClassEvolutionRow } from '@/lib/types-asset-allocation';
import { cn } from '@/lib/utils';

// Pretty-print fecha as "MMM-YY" (e.g. "Mar-26").
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
function fmtMonth(fecha: string): string {
  const [y, m] = fecha.split('-');
  return `${MONTH_ABBR[Number(m) - 1]}-${y.slice(2)}`;
}
function fmtPctTick(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}
function fmtPctTooltip(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// =================================================================
// Helpers — pivot evolution rows by date.
// =================================================================

type PointSystem = {
  fecha: string;
  local_equity: number;
  local_fi: number;
  foreign_equity: number;
  foreign_fi: number;
  total_assets: number;
};

function buildSystemSeries(rows: AssetClassEvolutionRow[]): PointSystem[] {
  const byFecha = new Map<string, PointSystem>();
  for (const r of rows) {
    if (r.tipo_fondo !== 'TOTAL') continue;
    if (!byFecha.has(r.fecha)) {
      byFecha.set(r.fecha, {
        fecha: r.fecha,
        local_equity: 0,
        local_fi: 0,
        foreign_equity: 0,
        foreign_fi: 0,
        total_assets: 0,
      });
    }
    const p = byFecha.get(r.fecha)!;
    switch (r.pdf_category) {
      case 'Local Equity':
        p.local_equity = r.monto_dolares;
        break;
      case 'Local Fixed Income':
        p.local_fi = r.monto_dolares;
        break;
      case 'Foreign Equity':
        p.foreign_equity = r.monto_dolares;
        break;
      case 'Foreign Fixed Income':
        p.foreign_fi = r.monto_dolares;
        break;
      case 'Total Assets':
        p.total_assets = r.monto_dolares;
        break;
    }
  }
  return Array.from(byFecha.values()).sort((a, b) =>
    a.fecha < b.fecha ? -1 : 1,
  );
}

// Pick the most recent quarter-end snapshots (Mar/Jun/Sep/Dec) up to N.
function pickQuarterly(rows: AssetClassEvolutionRow[], n = 4): string[] {
  const dates = Array.from(new Set(rows.map((r) => r.fecha)));
  const quarters = dates.filter((d) => {
    const m = Number(d.split('-')[1]);
    return m === 3 || m === 6 || m === 9 || m === 12;
  });
  return quarters.sort().slice(-n);
}

// One row per fund with a column per quarter holding the metric ratio.
function buildPerFundBars(
  rows: AssetClassEvolutionRow[],
  metric: 'equity' | 'foreign',
  quarters: string[],
  limitForFund: ((fund: 'A' | 'B' | 'C' | 'D' | 'E') => number) | null,
): Array<Record<string, string | number | null>> {
  type Cell = { num: number; den: number };
  const map = new Map<string, Cell>();
  const qSet = new Set(quarters);
  for (const r of rows) {
    if (!qSet.has(r.fecha)) continue;
    if (!['A', 'B', 'C', 'D', 'E'].includes(r.tipo_fondo)) continue;
    const key = `${r.tipo_fondo}|${r.fecha}`;
    if (!map.has(key)) map.set(key, { num: 0, den: 0 });
    const cell = map.get(key)!;
    if (r.pdf_category === 'Total Assets') cell.den = r.monto_dolares;
    if (metric === 'equity') {
      if (r.pdf_category === 'Local Equity' || r.pdf_category === 'Foreign Equity') {
        cell.num += r.monto_dolares;
      }
    } else {
      // Foreign = sum of all foreign categories.
      if (
        r.pdf_category === 'Foreign Equity' ||
        r.pdf_category === 'Foreign Fixed Income' ||
        r.pdf_category === 'Foreign Derivatives' ||
        r.pdf_category === 'Foreign Other'
      ) {
        cell.num += r.monto_dolares;
      }
    }
  }
  return (['A', 'B', 'C', 'D', 'E'] as const).map((fund) => {
    const row: Record<string, string | number | null> = {
      fund: `Fund ${fund}`,
      limit: limitForFund ? limitForFund(fund) : null,
    };
    for (const q of quarters) {
      const c = map.get(`${fund}|${q}`);
      row[q] = c && c.den > 0 ? c.num / c.den : 0;
    }
    return row;
  });
}

// =================================================================
// Asset Allocation Over Time — 3 stacked area variants
// =================================================================

type Variant = '4cat' | 'lvf' | 'eqfi';

const VARIANT_LABEL: Record<Variant, string> = {
  '4cat': 'Local Eq · Local FI · Foreign Eq · Foreign FI',
  lvf: 'Local vs Foreign',
  eqfi: 'Equity vs Fixed Income',
};

const ALLOC_CONFIG_4CAT = {
  local_equity: { label: 'Local Equity', color: 'var(--chart-1)' },
  local_fi: { label: 'Local Fixed Income', color: 'var(--chart-2)' },
  foreign_equity: { label: 'Foreign Equity', color: 'var(--chart-3)' },
  foreign_fi: { label: 'Foreign Fixed Income', color: 'var(--chart-4)' },
} satisfies ChartConfig;

const ALLOC_CONFIG_LVF = {
  local: { label: 'Local Investments', color: 'var(--chart-1)' },
  foreign: { label: 'Foreign Investments', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const ALLOC_CONFIG_EQFI = {
  equity: { label: 'Equity (Local + Foreign)', color: 'var(--chart-1)' },
  fi: { label: 'Fixed Income (Local + Foreign)', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function AssetAllocationOverTime({
  rows,
}: {
  rows: AssetClassEvolutionRow[];
}) {
  const [variant, setVariant] = useState<Variant>('4cat');
  const points = useMemo(() => buildSystemSeries(rows), [rows]);

  const data = useMemo(
    () =>
      points.map((p) => {
        const denom =
          (p.local_equity || 0) +
          (p.local_fi || 0) +
          (p.foreign_equity || 0) +
          (p.foreign_fi || 0);
        if (variant === '4cat') {
          return {
            fecha: p.fecha,
            local_equity: denom ? p.local_equity / denom : 0,
            local_fi: denom ? p.local_fi / denom : 0,
            foreign_equity: denom ? p.foreign_equity / denom : 0,
            foreign_fi: denom ? p.foreign_fi / denom : 0,
          };
        }
        if (variant === 'lvf') {
          const local = p.local_equity + p.local_fi;
          const foreign = p.foreign_equity + p.foreign_fi;
          const d2 = local + foreign;
          return {
            fecha: p.fecha,
            local: d2 ? local / d2 : 0,
            foreign: d2 ? foreign / d2 : 0,
          };
        }
        // eqfi
        const equity = p.local_equity + p.foreign_equity;
        const fi = p.local_fi + p.foreign_fi;
        const d3 = equity + fi;
        return {
          fecha: p.fecha,
          equity: d3 ? equity / d3 : 0,
          fi: d3 ? fi / d3 : 0,
        };
      }),
    [points, variant],
  );

  const config =
    variant === '4cat'
      ? ALLOC_CONFIG_4CAT
      : variant === 'lvf'
        ? ALLOC_CONFIG_LVF
        : ALLOC_CONFIG_EQFI;
  const series = Object.keys(config);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-muted-foreground">
          System asset allocation over time · {VARIANT_LABEL[variant]}
        </div>
        <SegmentedControl
          ariaLabel="Variant"
          value={variant}
          onChange={setVariant}
          options={[
            { value: '4cat' as Variant, label: '4 categories' },
            { value: 'lvf' as Variant, label: 'Local / Foreign' },
            { value: 'eqfi' as Variant, label: 'Equity / FI' },
          ]}
        />
      </div>
      <ChartContainer config={config} className="h-72 w-full">
        <AreaChart
          data={data}
          stackOffset="expand"
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            dataKey="fecha"
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtMonth}
            minTickGap={20}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={fmtPctTick}
            domain={[0, 1]}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => fmtMonth(String(label))}
                formatter={(value, name) => [
                  ` ${fmtPctTooltip(Number(value))}`,
                  String(name),
                ]}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((key) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="alloc"
              stroke={`var(--color-${key})`}
              fill={`var(--color-${key})`}
              fillOpacity={0.7}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

// =================================================================
// Limits per Fund — Equity over Total Assets / Foreign over Total Assets
// =================================================================

type Metric = 'equity' | 'foreign';

const METRIC_LABEL: Record<Metric, string> = {
  equity: 'Equity over Total Assets',
  foreign: 'Foreign Investment over Total Assets',
};

// Regulatory MAX limits per fund (Chilean DL 3500).
const MAX_LIMITS: Record<Metric, Record<'A' | 'B' | 'C' | 'D' | 'E', number>> = {
  equity:  { A: 0.80, B: 0.60, C: 0.40, D: 0.20, E: 0.05 },
  foreign: { A: 0.90, B: 0.80, C: 0.75, D: 0.40, E: 0.35 },
};

const QUARTER_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
];
const LIMIT_LINE_COLOR = '#ef4444'; // red-500

export function LimitsPerFund({
  rows,
}: {
  rows: AssetClassEvolutionRow[];
}) {
  const [metric, setMetric] = useState<Metric>('equity');

  const quarters = useMemo(() => pickQuarterly(rows, 4), [rows]);
  const limits = MAX_LIMITS[metric];
  const data = useMemo(
    () =>
      buildPerFundBars(
        rows,
        metric,
        quarters,
        limits ? (f) => limits[f] : null,
      ),
    [rows, metric, quarters, limits],
  );

  // ChartConfig keyed by quarter date strings → enables --color-<date> CSS vars.
  const config = useMemo(() => {
    const out: ChartConfig = {};
    quarters.forEach((q, i) => {
      out[q] = { label: fmtMonth(q), color: QUARTER_PALETTE[i] };
    });
    return out;
  }, [quarters]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-muted-foreground">
          {METRIC_LABEL[metric]} · per Fund Type
        </div>
        <SegmentedControl
          ariaLabel="Metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'equity' as Metric, label: 'Equity' },
            { value: 'foreign' as Metric, label: 'Foreign' },
          ]}
        />
      </div>
      <ChartContainer config={config} className="h-72 w-full">
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 16, left: 8, bottom: 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="fund" tickLine={false} axisLine={false} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={fmtPctTick}
            domain={[0, 1]}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => {
                  if (name === 'limit') return null; // hide from tooltip
                  return [
                    ` ${fmtPctTooltip(Number(value))}`,
                    String(name),
                  ];
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {quarters.map((q) => (
            <Bar
              key={q}
              dataKey={q}
              fill={`var(--color-${q})`}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          ))}
          {/*
            Regulatory MAX limit per fund — rendered as an invisible Bar
            whose only on-screen presence is the thick red top edge drawn by
            its custom `shape`. The bar takes its slot in the grouped layout
            (1 of N+1 slots, where N = number of quarter bars); the shape
            extends a horizontal line that spans the full fund bandwidth.
          */}
          {limits && (
            <Bar
              dataKey="limit"
              fill="transparent"
              isAnimationActive={false}
              legendType="none"
              shape={(props: unknown) => {
                const p = props as {
                  x?: number;
                  y?: number;
                  width?: number;
                };
                if (
                  p.x == null ||
                  p.y == null ||
                  p.width == null ||
                  p.width === 0
                ) {
                  return <Rectangle width={0} height={0} />;
                }
                // 5 quarter bars + 1 limit bar = 6 slots per fund. The full
                // fund band width is ~6 × this bar's width. The limit bar is
                // the LAST slot (rightmost), so the band starts 5×width to
                // the left of x.
                const slotsBefore = quarters.length;
                const totalSlots = slotsBefore + 1;
                const fundLeft = p.x - slotsBefore * p.width;
                const fundWidth = totalSlots * p.width;
                const lineWidth = fundWidth * 0.94;
                const cx = fundLeft + fundWidth / 2;
                return (
                  <line
                    x1={cx - lineWidth / 2}
                    x2={cx + lineWidth / 2}
                    y1={p.y}
                    y2={p.y}
                    stroke={LIMIT_LINE_COLOR}
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                );
              }}
            />
          )}
        </ComposedChart>
      </ChartContainer>
      <p className="text-[11px] text-muted-foreground">
        <span
          className="inline-block w-3 h-[2px] align-middle mr-1"
          style={{ backgroundColor: LIMIT_LINE_COLOR }}
        />
        Regulatory max per fund (DL 3500):{' '}
        {(['A', 'B', 'C', 'D', 'E'] as const)
          .map((f) => `${f} ${(limits[f] * 100).toFixed(0)}%`)
          .join(' · ')}
        .
      </p>
    </div>
  );
}
