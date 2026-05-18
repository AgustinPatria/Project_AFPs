'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { C1_CATEGORIES, type AfpC1Row, type C1Name } from '@/lib/dimensions';

const C1_TO_SLUG: Record<C1Name, string> = {
  'Private Equity': 'pe',
  'Private Debt': 'pd',
  'Real Asset': 'ra',
  'Other Alternative': 'oa',
  Local: 'local',
};

const CHART_CONFIG = {
  pe: { label: 'Private Equity', color: 'var(--chart-1)' },
  pd: { label: 'Private Debt', color: 'var(--chart-2)' },
  ra: { label: 'Real Asset', color: 'var(--chart-3)' },
  oa: { label: 'Other Alternative', color: 'var(--chart-4)' },
  local: { label: 'Local', color: 'var(--chart-5)' },
} satisfies ChartConfig;

export function NavByAfpC1Chart({ data }: { data: AfpC1Row[] }) {
  const chartData = data.map((row) => {
    const out: Record<string, string | number> = { afp: row.afp };
    for (const c1 of C1_CATEGORIES) {
      out[C1_TO_SLUG[c1]] = row[c1];
    }
    return out;
  });

  return (
    <ChartContainer config={CHART_CONFIG} className="h-80 w-full">
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="afp" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={64} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {C1_CATEGORIES.map((c1) => {
          const slug = C1_TO_SLUG[c1];
          return (
            <Bar
              key={slug}
              dataKey={slug}
              stackId="c1"
              fill={`var(--color-${slug})`}
              radius={0}
            />
          );
        })}
      </BarChart>
    </ChartContainer>
  );
}
