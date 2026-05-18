export const revalidate = 3600;

import { Coins, Divide, Users, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Disclaimer } from '@/components/disclaimer';
import { KpiCard } from '@/components/kpi-card';
import { PageHeader } from '@/components/page-header';
import { AumTable } from '@/components/market-share/aum-table';
import { ContributorsSection } from '@/components/market-share/contributors-section';
import { ReturnsTable } from '@/components/market-share/returns-table';
import { FlowsTable } from '@/components/market-share/flows-table';
import {
  getAumByAfpTipo,
  getContributorsByAfp,
  getFlowsByAfpTipo,
  getMarketShareDates,
  getReturnsByAfpTipo,
} from '@/lib/queries-market-share';
import { recentCompleteYears } from '@/lib/types-market-share';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha: fechaParam } = await searchParams;
  const dates = await getMarketShareDates();
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

  // Calendar-year tabs: pull YTD-at-Dec-31 for each of the two most-recent
  // complete years, only when that fecha actually exists in the dataset.
  const cyYears = recentCompleteYears(fecha, 2).filter((y) =>
    dates.includes(`${y}-12-31`),
  );

  const [aum, returns, flows, contributors, prevAum, calendarYears] =
    await Promise.all([
      getAumByAfpTipo(fecha),
      getReturnsByAfpTipo(fecha),
      getFlowsByAfpTipo(fecha),
      getContributorsByAfp(fecha),
      prevFecha
        ? getAumByAfpTipo(prevFecha)
        : Promise.resolve<Awaited<ReturnType<typeof getAumByAfpTipo>>>([]),
      Promise.all(
        cyYears.map(async (year) => {
          const yearEnd = `${year}-12-31`;
          const [r, f] = await Promise.all([
            getReturnsByAfpTipo(yearEnd),
            getFlowsByAfpTipo(yearEnd),
          ]);
          return { year, returns: r, flows: f };
        }),
      ),
    ]);

  const cyReturns = calendarYears.map((c) => ({ year: c.year, rows: c.returns }));
  const cyFlows = calendarYears.map((c) => ({ year: c.year, rows: c.flows }));

  // System totals (sum across A-E and across AFPs).
  const sysAumUsd = aum
    .filter((r) => r.tipo_fondo !== 'TOTAL')
    .reduce((s, r) => s + r.aum_usd_mm, 0);
  const sysAumClp = aum
    .filter((r) => r.tipo_fondo !== 'TOTAL')
    .reduce((s, r) => s + r.aum_clp_bn, 0);
  const prevSysAumUsd = prevAum
    .filter((r) => r.tipo_fondo !== 'TOTAL')
    .reduce((s, r) => s + r.aum_usd_mm, 0);

  const nAfps = new Set(aum.map((r) => r.afp)).size;

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Market Share, Returns & Flows"
        subtitle="AFP Chile · system view at month-end"
        dates={dates}
        currentDate={fecha}
      />

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="System AUM (USD MM)"
          value={sysAumUsd}
          prev={prevSysAumUsd || null}
          icon={Wallet}
        />
        <KpiCard
          label="System AUM (CLP bn)"
          value={sysAumClp}
          unit="CLP bn"
          icon={Coins}
        />
        <KpiCard label="# AFPs" value={nAfps} unit="" icon={Users} />
        <KpiCard
          label="Avg AUM / AFP"
          value={nAfps > 0 ? sysAumUsd / nAfps : 0}
          icon={Divide}
        />
      </section>

      <Disclaimer variant="data-sources" />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            AUM by AFP × Fund Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AumTable rows={aum} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Market Share & Contributors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ContributorsSection rows={contributors} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Returns</CardTitle>
        </CardHeader>
        <CardContent>
          <ReturnsTable rows={returns} calendarYears={cyReturns} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Net Flows (USD MM)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FlowsTable rows={flows} calendarYears={cyFlows} />
        </CardContent>
      </Card>
    </main>
  );
}
