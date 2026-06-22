export const revalidate = 3600;

import type { ReactNode } from 'react';
import { Activity, Hourglass, Layers, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabNav } from '@/components/ui/tab-nav';
import { KpiCard } from '@/components/kpi-card';
import { AfpSelector } from '@/components/alternatives/afp-selector';
import { StackedAreaChart } from '@/components/alternatives/stacked-area-chart';
import { OverviewTable } from '@/components/overview-table';
import { PageHeader } from '@/components/page-header';
import { AsOfBadge } from '@/components/as-of-badge';
import { TotalEvolutionChart } from '@/components/total-evolution-chart';
import { getAvailableDates, getEvolution, getOverview } from '@/lib/queries';
import {
  getAfpDetail,
  getNavUncalledEvolution,
  getTotalC1Evolution,
} from '@/lib/queries-alternatives';
import { C1_CATEGORIES } from '@/lib/dimensions';
import {
  AFP_COLORS,
  ALT_AFPS,
  C1_COLORS,
  LOCAL_KEYS,
  PD_STRATEGIES,
  PE_STRATEGIES,
  RA_KEYS,
  paletteFor,
  type AfpDetailSeries,
  type AfpOrSystem,
} from '@/lib/types-alternatives';
import type { OverviewRow } from '@/lib/dimensions';

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'evolution', label: 'Evolution' },
  { id: 'detail', label: 'AFP Detail' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const NAV_UNCALLED_COLORS = {
  NAV: 'oklch(0.65 0.18 250)',
  Uncalled: 'oklch(0.75 0.16 50)',
};

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

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; tab?: string; afp?: string }>;
}) {
  const { fecha: fechaParam, tab: tabParam, afp: afpParam } = await searchParams;
  const dates = await getAvailableDates();
  const fecha = fechaParam && dates.includes(fechaParam) ? fechaParam : dates[0];

  const tab: TabId = TABS.some((t) => t.id === tabParam)
    ? (tabParam as TabId)
    : 'summary';
  const afp: AfpOrSystem = (ALT_AFPS as readonly string[]).includes(
    afpParam ?? '',
  )
    ? (afpParam as AfpOrSystem)
    : 'SYSTEM';

  if (!fecha) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data available.</p>
      </main>
    );
  }

  const idx = dates.indexOf(fecha);
  const prevFecha = idx >= 0 && idx + 1 < dates.length ? dates[idx + 1] : null;

  // Fetch only what the active tab renders (same pattern as /foreign).
  const [overview, prevOverview, evolution, totalC1, navUncalled, detail] =
    await Promise.all([
      tab === 'summary' ? getOverview(fecha) : Promise.resolve<OverviewRow[]>([]),
      tab === 'summary' && prevFecha
        ? getOverview(prevFecha)
        : Promise.resolve<OverviewRow[]>([]),
      tab === 'summary' || tab === 'evolution'
        ? getEvolution()
        : Promise.resolve({ totals: [], aums: [] }),
      tab === 'evolution' ? getTotalC1Evolution() : Promise.resolve([]),
      tab === 'evolution'
        ? getNavUncalledEvolution()
        : Promise.resolve({ navByAfp: [], uncalledByAfp: [], navVsUncalled: [] }),
      tab === 'detail'
        ? getAfpDetail(afp)
        : Promise.resolve<AfpDetailSeries | null>(null),
    ]);

  const totals = sumOverview(overview);
  const prevTotals = sumOverview(prevOverview);

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Alternative Assets"
        subtitle="AFP Chile · alternative assets at cartera month-end (4-month lag)"
        dates={dates}
        currentDate={fecha}
      >
        <AsOfBadge module="alternatives" />
      </PageHeader>

      <TabNav current={tab} tabs={TABS} />

      {tab === 'summary' && (
        <>
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
              label="System AUM"
              value={totals.aum}
              prev={prevTotals.aum || null}
              icon={Activity}
            />
          </section>

          <ChartCard title={`Summary by AFP (${fecha})`}>
            <OverviewTable rows={overview} />
          </ChartCard>

          <ChartCard title="Alternative Assets Evolution">
            <TotalEvolutionChart
              totals={evolution.totals}
              aums={evolution.aums}
            />
          </ChartCard>
        </>
      )}

      {tab === 'evolution' && (
        <>
          <section className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Total Alternatives by AFP">
              <StackedAreaChart
                data={evolution.totals}
                keys={ALT_AFPS}
                colors={AFP_COLORS}
              />
            </ChartCard>
            <ChartCard title="Total Alternatives by Category">
              <StackedAreaChart
                data={totalC1}
                keys={C1_CATEGORIES}
                colors={C1_COLORS}
              />
            </ChartCard>
            <ChartCard title="Net Asset Value by AFP">
              <StackedAreaChart
                data={navUncalled.navByAfp}
                keys={ALT_AFPS}
                colors={AFP_COLORS}
              />
            </ChartCard>
            <ChartCard title="Uncalled Capital by AFP">
              <StackedAreaChart
                data={navUncalled.uncalledByAfp}
                keys={ALT_AFPS}
                colors={AFP_COLORS}
              />
            </ChartCard>
            <ChartCard title="NAV vs Uncalled (System)">
              <StackedAreaChart
                data={navUncalled.navVsUncalled}
                keys={['NAV', 'Uncalled']}
                colors={NAV_UNCALLED_COLORS}
              />
            </ChartCard>
          </section>
        </>
      )}

      {tab === 'detail' && detail && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <AfpSelector current={afp} />
          </div>
          <ChartCard title={`${afp} — Alternatives by Category`}>
            <StackedAreaChart
              data={detail.byC1}
              keys={C1_CATEGORIES}
              colors={C1_COLORS}
              className="h-80 w-full"
            />
          </ChartCard>
          <section className="grid gap-6 lg:grid-cols-2">
            <ChartCard title={`${afp} — Private Equity (Foreign)`}>
              <StackedAreaChart
                data={detail.foreignPE}
                keys={PE_STRATEGIES}
                colors={paletteFor(PE_STRATEGIES)}
              />
            </ChartCard>
            <ChartCard title={`${afp} — Private Debt (Foreign)`}>
              <StackedAreaChart
                data={detail.foreignPD}
                keys={PD_STRATEGIES}
                colors={paletteFor(PD_STRATEGIES)}
              />
            </ChartCard>
            <ChartCard title={`${afp} — Real Asset (Foreign)`}>
              <StackedAreaChart
                data={detail.foreignRA}
                keys={RA_KEYS}
                colors={paletteFor(RA_KEYS)}
              />
            </ChartCard>
            <ChartCard title={`${afp} — Local`}>
              <StackedAreaChart
                data={detail.local}
                keys={LOCAL_KEYS}
                colors={paletteFor(LOCAL_KEYS)}
              />
            </ChartCard>
          </section>
        </>
      )}
    </main>
  );
}
