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
import { C1_COLORS } from '@/lib/types-alternatives';

const C1_TO_SLUG: Record<C1Name, string> = {
  'Private Equity': 'pe',
  'Private Debt': 'pd',
  'Real Asset': 'ra',
  'Other Alternative': 'oa',
  Local: 'local',
};

// Colors come from the canonical C1_COLORS map (task 6.2) so this chart always
// matches the by-category stacked areas and the Foreign module's concept hues.
const CHART_CONFIG = Object.fromEntries(
  C1_CATEGORIES.map((c1) => [
    C1_TO_SLUG[c1],
    { label: c1, color: C1_COLORS[c1] },
  ]),
) satisfies ChartConfig;

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
