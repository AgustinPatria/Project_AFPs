'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { fmtUsdMM } from '@/lib/format';

// Loose point shape so both SeriesPoint and the legacy EvolutionPoint
// (optional per-AFP keys, no index signature) are accepted.
type ChartPoint = { fecha: string };

function fmtMonth(fecha: string): string {
  const [y, m] = fecha.split('-');
  return `${m}/${y.slice(2)}`;
}

/**
 * Stacked area chart, the visual unit of the alts PDF Evolution/Detail pages.
 * Series with no data across the whole range are dropped so the legend stays
 * clean (e.g. an AFP with no Venture Capital exposure).
 */
export function StackedAreaChart({
  data,
  keys,
  colors,
  className,
}: {
  data: readonly ChartPoint[];
  keys: readonly string[];
  colors: Record<string, string>;
  className?: string;
}) {
  const presentKeys = useMemo(
    () =>
      keys.filter((k) =>
        data.some(
          (p) => (Number((p as Record<string, unknown>)[k]) || 0) > 0,
        ),
      ),
    [keys, data],
  );

  const config = Object.fromEntries(
    presentKeys.map((k) => [k, { label: k, color: colors[k] }]),
  ) satisfies ChartConfig;

  if (presentKeys.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        No data for this selection.
      </div>
    );
  }

  return (
    <ChartContainer config={config} className={className ?? 'h-64 w-full'}>
      <AreaChart
        data={data as ChartPoint[]}
        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
      >
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="var(--chart-grid)"
        />
        <XAxis
          dataKey="fecha"
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtMonth}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => fmtUsdMM(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => fmtMonth(String(label))}
              formatter={(value, name) => [
                ` ${fmtUsdMM(Number(value))} USD MM`,
                String(name),
              ]}
            />
          }
        />
        {presentKeys.map((k) => (
          <Area
            key={k}
            dataKey={k}
            stackId="1"
            type="monotone"
            fill={colors[k]}
            fillOpacity={0.45}
            stroke={colors[k]}
            strokeWidth={1.5}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
