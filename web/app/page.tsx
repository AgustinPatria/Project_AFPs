export const revalidate = 3600;

import { Activity, Hourglass, Layers, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/kpi-card';
import { NavByAfpC1Chart } from '@/components/nav-by-afp-c1-chart';
import { OverviewTable } from '@/components/overview-table';
import { PageHeader } from '@/components/page-header';
import { TotalEvolutionChart } from '@/components/total-evolution-chart';
import {
  getAvailableDates,
  getEvolution,
  getNavByAfpC1,
  getOverview,
} from '@/lib/queries';
import type { OverviewRow } from '@/lib/dimensions';

function sumOverview(rows: OverviewRow[]) {
  return rows.reduce(
    (acc, r) => ({
      aum: acc.aum + r.aum,
      nav: acc.nav + r.nav,
      uncalled: acc.uncalled + r.uncalled,
      total: acc.total + r.total,
    }),
    { aum: 0, nav: 0, uncalled: 0, total: 0 },
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha: fechaParam } = await searchParams;
  const dates = await getAvailableDates();
  const fecha = fechaParam && dates.includes(fechaParam) ? fechaParam : dates[0];

  if (!fecha) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data available.</p>
      </main>
    );
  }

  const idx = dates.indexOf(fecha);
  const prevFecha = idx >= 0 && idx + 1 < dates.length ? dates[idx + 1] : null;

  const [overview, navByAfpC1, evolution, prevOverview] = await Promise.all([
    getOverview(fecha),
    getNavByAfpC1(fecha),
    getEvolution(),
    prevFecha
      ? getOverview(prevFecha)
      : Promise.resolve<OverviewRow[]>([]),
  ]);

  const totals = sumOverview(overview);
  const prevTotals = sumOverview(prevOverview);
  const nAfps = overview.length;

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Alternative Assets"
        subtitle="AFP Chile · system view at month-end"
        dates={dates}
        currentDate={fecha}
      />

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Alternatives"
          value={totals.total}
          prev={prevTotals.total || null}
          icon={Layers}
        />
        <KpiCard
          label="NAV"
          value={totals.nav}
          prev={prevTotals.nav || null}
          icon={Wallet}
        />
        <KpiCard
          label="Uncalled"
          value={totals.uncalled}
          prev={prevTotals.uncalled || null}
          icon={Hourglass}
        />
        <KpiCard
          label="# AFPs"
          value={nAfps}
          unit=""
          icon={Activity}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Summary by AFP
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OverviewTable rows={overview} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            NAV by AFP × Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NavByAfpC1Chart data={navByAfpC1} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Total Alternatives Evolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TotalEvolutionChart totals={evolution.totals} aums={evolution.aums} />
        </CardContent>
      </Card>
    </main>
  );
}
