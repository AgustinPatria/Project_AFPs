'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartColumn, TrendingUp } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AFPS, type AfpName, type EvolutionPoint } from '@/lib/dimensions';
import { fmtUsdMM } from '@/lib/format';
import { cn } from '@/lib/utils';

type Period = '1M' | '3M' | 'YTD' | '1Y' | '3Y' | 'ALL';
type ChartKind = 'line' | 'bar';
type Mode = 'usd' | 'pct';

const COLORS: Record<AfpName, string> = {
  BANSANDER: 'oklch(0.6 0 0)',
  CAPITAL: 'oklch(0.75 0.16 50)',
  CUPRUM: 'oklch(0.7 0.14 160)',
  HABITAT: 'oklch(0.65 0.18 250)',
  MODELO: 'oklch(0.65 0.18 305)',
  PLANVITAL: 'oklch(0.78 0.16 100)',
  PROVIDA: 'oklch(0.65 0.18 360)',
  UNO: 'oklch(0.78 0.03 220)',
};

const CHART_CONFIG = Object.fromEntries(
  AFPS.map((afp) => [afp, { label: afp, color: COLORS[afp] }]),
) satisfies ChartConfig;

function fmtMonth(fecha: string): string {
  const [y, m] = fecha.split('-');
  return `${m}/${y.slice(2)}`;
}

function fmtPctOfAum(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function TotalEvolutionChart({
  totals,
  aums,
}: {
  totals: EvolutionPoint[];
  aums: EvolutionPoint[];
}) {
  const presentAfps = useMemo(
    () =>
      AFPS.filter((afp) =>
        totals.some((p) => (p[afp] ?? 0) > 0),
      ) as AfpName[],
    [totals],
  );

  const [period, setPeriod] = useState<Period>('1Y');
  const [kind, setKind] = useState<ChartKind>('line');
  const [mode, setMode] = useState<Mode>('usd');
  const [active, setActive] = useState<Set<AfpName>>(
    () => new Set(presentAfps),
  );

  const series = useMemo(() => {
    if (mode === 'usd') return totals;
    const aumByFecha = new Map(aums.map((p) => [p.fecha, p]));
    return totals.map((p) => {
      const out: EvolutionPoint = { fecha: p.fecha };
      const aumPoint = aumByFecha.get(p.fecha);
      for (const afp of presentAfps) {
        const t = p[afp] ?? 0;
        const a = aumPoint?.[afp] ?? 0;
        out[afp] = a > 0 ? t / a : 0;
      }
      return out;
    });
  }, [mode, totals, aums, presentAfps]);

  const filtered = useMemo(() => {
    if (period === 'ALL' || series.length === 0) return series;
    if (period === 'YTD') {
      const last = series[series.length - 1];
      const year = last.fecha.slice(0, 4);
      return series.filter((p) => p.fecha.slice(0, 4) === year);
    }
    const months: Record<Exclude<Period, 'ALL' | 'YTD'>, number> = {
      '1M': 2,
      '3M': 4,
      '1Y': 13,
      '3Y': 37,
    };
    return series.slice(-months[period]);
  }, [series, period]);

  const activeAfps = presentAfps.filter((afp) => active.has(afp));

  function toggle(afp: AfpName) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(afp)) next.delete(afp);
      else next.add(afp);
      return next;
    });
  }

  const yFmt = mode === 'usd' ? (v: number) => fmtUsdMM(v) : fmtPctOfAum;
  const tooltipFmt = (value: number, name: string) => [
    mode === 'usd'
      ? ` ${fmtUsdMM(value)} USD MM`
      : ` ${fmtPctOfAum(value)} of AUM`,
    name,
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <SegmentedControl
            ariaLabel="Period"
            value={period}
            onChange={setPeriod}
            options={(['1M', '3M', 'YTD', '1Y', '3Y', 'ALL'] as Period[]).map(
              (p) => ({ value: p, label: p }),
            )}
          />
          <SegmentedControl
            ariaLabel="Chart kind"
            value={kind}
            onChange={setKind}
            size="sm"
            options={[
              {
                value: 'line',
                title: 'Line',
                label: <TrendingUp className="h-3.5 w-3.5" />,
              },
              {
                value: 'bar',
                title: 'Bar',
                label: <ChartColumn className="h-3.5 w-3.5" />,
              },
            ]}
          />
          <SegmentedControl
            ariaLabel="Unit"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'usd', label: 'USD MM' },
              { value: 'pct', label: '% AUM' },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presentAfps.map((afp) => {
            const isOn = active.has(afp);
            return (
              <button
                key={afp}
                onClick={() => toggle(afp)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors',
                  isOn
                    ? 'border-border bg-muted/50 text-foreground'
                    : 'border-border/50 text-muted-foreground/60 hover:text-foreground',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: isOn ? COLORS[afp] : 'transparent',
                    border: isOn ? 'none' : `1px solid ${COLORS[afp]}`,
                  }}
                />
                {afp}
              </button>
            );
          })}
        </div>
      </div>
      <ChartContainer config={CHART_CONFIG} className="h-80 w-full">
        {kind === 'line' ? (
          <LineChart
            data={filtered}
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
              width={64}
              tickFormatter={yFmt}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => fmtMonth(String(label))}
                  formatter={(value, name) =>
                    tooltipFmt(Number(value), String(name))
                  }
                />
              }
            />
            {activeAfps.map((afp) => (
              <Line
                key={afp}
                type="monotone"
                dataKey={afp}
                stroke={COLORS[afp]}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  stroke: 'var(--background)',
                  strokeWidth: 2,
                }}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart
            data={filtered}
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
              width={64}
              tickFormatter={yFmt}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => fmtMonth(String(label))}
                  formatter={(value, name) =>
                    tooltipFmt(Number(value), String(name))
                  }
                />
              }
            />
            {activeAfps.map((afp) => (
              <Bar key={afp} dataKey={afp} fill={COLORS[afp]} radius={2} />
            ))}
          </BarChart>
        )}
      </ChartContainer>
    </div>
  );
}
