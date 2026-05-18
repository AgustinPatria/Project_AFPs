'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fmtUsdMM } from '@/lib/format';
import type {
  StrategyFundPoint,
  StrategyTimePoint,
} from '@/lib/queries-strategy';
import { cn } from '@/lib/utils';

// Stable, distinguishable color palette for fund series.
const PALETTE = [
  'oklch(0.65 0.18 30)',   // orange
  'oklch(0.72 0.15 350)',  // pink
  'oklch(0.75 0.16 200)',  // cyan
  'oklch(0.65 0.18 280)',  // purple
  'oklch(0.78 0.18 90)',   // yellow
  'oklch(0.65 0.18 150)',  // green
  'oklch(0.6 0.16 30)',    // dark orange
  'oklch(0.55 0.05 250)',  // gray-blue
  'oklch(0.65 0.18 250)',  // blue
  'oklch(0.7 0.12 130)',   // teal
];

function colorFor(idx: number): string {
  return PALETTE[idx % PALETTE.length];
}

function fmtMonth(periodo: string): string {
  const [y, m] = periodo.split('-');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${monthNames[Number(m) - 1]}-${y.slice(2)}`;
}

export function StrategyPieChart({
  snapshot,
}: {
  snapshot: StrategyFundPoint[];
}) {
  const data = snapshot.map((p, i) => ({
    name: p.fund_short_name,
    value: p.monto_usd_mm,
    pct: p.market_share_pct,
    color: colorFor(i),
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-center">
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={0}
              outerRadius={110}
              stroke="hsl(var(--background))"
              strokeWidth={1}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-sm">
                    <div className="font-medium">{d.name}</div>
                    <div className="tabular-nums text-muted-foreground">
                      {fmtUsdMM(d.value)} · {d.pct.toFixed(1)}%
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ol className="space-y-1.5 text-xs">
        {data.map((d) => (
          <li
            key={d.name}
            className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-b-0"
          >
            <span className="inline-flex items-baseline gap-2 truncate min-w-0">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="tabular-nums shrink-0">
              <span className="font-medium">{d.pct.toFixed(1)}%</span>
              <span className="text-muted-foreground ml-2">
                {fmtUsdMM(d.value)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type Mode = 'usd' | 'pct';

export function StrategyTimeSeriesChart({
  series,
}: {
  series: StrategyTimePoint[];
}) {
  const [mode, setMode] = useState<Mode>('usd');

  const { data, funds } = useMemo(() => {
    // pivot: [{periodo, [fund]: value}, ...]
    const fundSet = new Set<string>();
    const byPeriodo = new Map<string, Record<string, number>>();
    for (const r of series) {
      fundSet.add(r.fund_short_name);
      let row = byPeriodo.get(r.periodo);
      if (!row) {
        row = { periodo: r.periodo } as unknown as Record<string, number>;
        (row as unknown as { periodoLabel: string }).periodoLabel = fmtMonth(r.periodo);
        byPeriodo.set(r.periodo, row);
      }
      row[r.fund_short_name] = mode === 'usd' ? r.monto_usd_mm : r.market_share_pct;
    }
    const data = Array.from(byPeriodo.values()).sort((a, b) =>
      String((a as { periodo: string }).periodo).localeCompare(
        String((b as { periodo: string }).periodo),
      ),
    );
    // Order funds by their max value desc so legend ranks them.
    const funds = Array.from(fundSet).sort((a, b) => {
      const ma = Math.max(...data.map((d) => Number(d[a] ?? 0)));
      const mb = Math.max(...data.map((d) => Number(d[b] ?? 0)));
      return mb - ma;
    });
    return { data, funds };
  }, [series, mode]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {mode === 'usd' ? 'AUM AFPs Evolution' : 'Market Share Evolution'}
        </h3>
        <SegmentedControl
          ariaLabel="Unit"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'usd' as const, label: 'USD MM' },
            { value: 'pct' as const, label: '%' },
          ]}
        />
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="periodoLabel"
              tick={{ fontSize: 10 }}
              tickMargin={6}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) =>
                mode === 'usd' ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}%`
              }
              width={48}
              domain={mode === 'pct' ? [0, 100] : undefined}
              ticks={mode === 'pct' ? [0, 20, 40, 60, 80, 100] : undefined}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const sorted = [...payload].sort(
                  (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0),
                );
                return (
                  <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-[11px] shadow-sm space-y-0.5">
                    <div className="font-medium border-b border-border/40 pb-1 mb-1">
                      {label}
                    </div>
                    {sorted.map((p) => (
                      <div
                        key={String(p.dataKey)}
                        className="flex items-baseline gap-2"
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="flex-1 truncate">{String(p.dataKey)}</span>
                        <span className="tabular-nums">
                          {mode === 'usd'
                            ? fmtUsdMM(Number(p.value) || 0)
                            : `${(Number(p.value) || 0).toFixed(1)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
              iconType="line"
              iconSize={10}
            />
            {funds.map((fund, i) => (
              <Line
                key={fund}
                type="monotone"
                dataKey={fund}
                stroke={colorFor(i)}
                strokeWidth={1.5}
                dot={false}
                activeDot={{
                  r: 4,
                  stroke: 'var(--background)',
                  strokeWidth: 2,
                }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
