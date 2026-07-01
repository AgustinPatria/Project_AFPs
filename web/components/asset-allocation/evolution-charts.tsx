'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  useXAxisScale,
  useYAxisScale,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AFPS_AC,
  type AssetClassEvolutionRow,
  type AssetClassEvolutionByAfpRow,
} from '@/lib/types-asset-allocation';
import { ASSET_CLASS_COLORS } from '@/lib/dimensions';
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

function buildAfpSeries(
  rows: AssetClassEvolutionByAfpRow[],
  afp: string,
): PointSystem[] {
  const byFecha = new Map<string, PointSystem>();
  for (const r of rows) {
    if (r.afp !== afp) continue;
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

// Pick the most recent N monthly snapshots (any month). N=3 ≈ trailing 90 days.
function pickLastMonths(rows: AssetClassEvolutionRow[], n = 3): string[] {
  const dates = Array.from(new Set(rows.map((r) => r.fecha))).sort();
  return dates.slice(-n);
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
      // Foreign = sum of all foreign categories. 'Foreign Alternatives' is
      // included: it used to sit inside 'Foreign Equity' before 1.3 carved it
      // out, so the foreign-limit ratio must still count it.
      if (
        r.pdf_category === 'Foreign Equity' ||
        r.pdf_category === 'Foreign Fixed Income' ||
        r.pdf_category === 'Foreign Derivatives' ||
        r.pdf_category === 'Foreign Alternatives' ||
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

// Colors come from the canonical asset-class palette (task 6.2) so each class
// matches its color in the Foreign module and elsewhere.
const ALLOC_CONFIG_4CAT = {
  local_equity: { label: 'Local Equity', color: ASSET_CLASS_COLORS.local_equity },
  local_fi: { label: 'Local Fixed Income', color: ASSET_CLASS_COLORS.local_fixed_income },
  foreign_equity: { label: 'Foreign Equity', color: ASSET_CLASS_COLORS.foreign_equity },
  foreign_fi: { label: 'Foreign Fixed Income', color: ASSET_CLASS_COLORS.foreign_fixed_income },
} satisfies ChartConfig;

const ALLOC_CONFIG_LVF = {
  local: { label: 'Local Investments', color: ASSET_CLASS_COLORS.local },
  foreign: { label: 'Foreign Investments', color: ASSET_CLASS_COLORS.foreign },
} satisfies ChartConfig;

const ALLOC_CONFIG_EQFI = {
  equity: { label: 'Equity (Local + Foreign)', color: ASSET_CLASS_COLORS.equity },
  fi: { label: 'Fixed Income (Local + Foreign)', color: ASSET_CLASS_COLORS.fixed_income },
} satisfies ChartConfig;

const AFP_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'TOTAL', label: 'System' },
  ...AFPS_AC.map((a) => ({ value: a, label: a })),
];

export function AssetAllocationOverTime({
  rows,
}: {
  rows: AssetClassEvolutionByAfpRow[];
}) {
  const [variant, setVariant] = useState<Variant>('4cat');
  const [afp, setAfp] = useState<string>('TOTAL');
  const points = useMemo(() => buildAfpSeries(rows, afp), [rows, afp]);

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
          {afp === 'TOTAL' ? 'System' : afp} asset allocation over time ·{' '}
          {VARIANT_LABEL[variant]}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={afp} onValueChange={(v) => setAfp(v ?? 'TOTAL')}>
            <SelectTrigger className="w-[150px]" aria-label="AFP">
              <SelectValue>
                {(value: string | null) =>
                  !value || value === 'TOTAL' ? 'System' : value
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AFP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
const AVG90_LINE_COLOR = '#f59e0b'; // amber-500 — trailing 90-day average

// Per-fund reference lines (regulatory max, 90-day avg) drawn across each
// fund's full band using the chart's real axis scales (recharts ≥3.8 hooks).
// Rendered as a child of the ComposedChart so the hooks have chart context.
function FundRefLines({
  rows,
}: {
  rows: Array<{ fund: string; limit: number | null; avg90: number | null }>;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  return (
    <g>
      {rows.map((r) => {
        const x0 = xScale(r.fund, { position: 'start' });
        const x1 = xScale(r.fund, { position: 'end' });
        if (x0 == null || x1 == null) return null;
        const pad = (x1 - x0) * 0.05;
        const seg = (v: number | null, color: string, width: number, dash?: string) => {
          if (v == null) return null;
          const y = yScale(v);
          if (y == null) return null;
          return (
            <line
              x1={x0 + pad}
              x2={x1 - pad}
              y1={y}
              y2={y}
              stroke={color}
              strokeWidth={width}
              strokeDasharray={dash}
              strokeLinecap="round"
            />
          );
        };
        return (
          <g key={r.fund}>
            {seg(r.avg90, AVG90_LINE_COLOR, 2, '5 3')}
            {seg(r.limit, LIMIT_LINE_COLOR, 3)}
          </g>
        );
      })}
    </g>
  );
}

type BarPeriod = 'quarterly' | 'last3m';

export function LimitsPerFund({
  rows,
}: {
  rows: AssetClassEvolutionRow[];
}) {
  const [metric, setMetric] = useState<Metric>('equity');
  // 5.1 — bars can show the quarterly trend or zoom into the same last-3-months
  // window the 90-day average line is computed from.
  const [barPeriod, setBarPeriod] = useState<BarPeriod>('quarterly');

  const periods = useMemo(
    () =>
      barPeriod === 'quarterly' ? pickQuarterly(rows, 4) : pickLastMonths(rows, 3),
    [rows, barPeriod],
  );
  const limits = MAX_LIMITS[metric];

  // 5.1 — trailing 90-day average per fund: mean of the metric ratio over the
  // last 3 monthly snapshots. Lets you size the adjustment vs the regulatory
  // max (headroom = max − avg) instead of reading it off a single month.
  const last3 = useMemo(() => pickLastMonths(rows, 3), [rows]);
  const avg90ByFund = useMemo(() => {
    const bars = buildPerFundBars(rows, metric, last3, null);
    const out: Record<string, number> = {};
    for (const r of bars) {
      const vals = last3
        .map((d) => r[d])
        .filter((v): v is number => typeof v === 'number');
      out[r.fund as string] = vals.length
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : 0;
    }
    return out;
  }, [rows, metric, last3]);

  const data = useMemo(
    () =>
      buildPerFundBars(
        rows,
        metric,
        periods,
        limits ? (f) => limits[f] : null,
      ).map((r) => ({ ...r, avg90: avg90ByFund[r.fund as string] ?? null })),
    [rows, metric, periods, limits, avg90ByFund],
  );

  // ChartConfig keyed by period date strings → enables --color-<date> CSS vars.
  const config = useMemo(() => {
    const out: ChartConfig = {};
    periods.forEach((q, i) => {
      out[q] = { label: fmtMonth(q), color: QUARTER_PALETTE[i] };
    });
    return out;
  }, [periods]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-muted-foreground">
          {METRIC_LABEL[metric]} · per Fund Type
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedControl
            ariaLabel="Bar period"
            value={barPeriod}
            onChange={setBarPeriod}
            options={[
              { value: 'quarterly' as BarPeriod, label: 'Quarterly' },
              { value: 'last3m' as BarPeriod, label: 'Last 3 months' },
            ]}
          />
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
                formatter={(value, name) => [
                  ` ${fmtPctTooltip(Number(value))}`,
                  String(name),
                ]}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {periods.map((q) => (
            <Bar
              key={q}
              dataKey={q}
              fill={`var(--color-${q})`}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          ))}
          <FundRefLines
            rows={data.map((row) => {
              const rec = row as Record<string, unknown>;
              return {
                fund: String(rec.fund),
                limit: typeof rec.limit === 'number' ? rec.limit : null,
                avg90: typeof rec.avg90 === 'number' ? rec.avg90 : null,
              };
            })}
          />
        </ComposedChart>
      </ChartContainer>
      <div className="space-y-1">
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
        <p className="text-[11px] text-muted-foreground">
          <span
            className="inline-block w-3 h-0 align-middle mr-1 border-t-2 border-dashed"
            style={{ borderColor: AVG90_LINE_COLOR }}
          />
          Trailing 90-day average ({last3.map(fmtMonth).join(' · ') || '—'}) —
          gap to the red line sizes the headroom to the regulatory limit.
        </p>
      </div>
    </div>
  );
}
