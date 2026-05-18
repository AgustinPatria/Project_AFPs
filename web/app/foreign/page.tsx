export const revalidate = 3600;

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabNav } from '@/components/ui/tab-nav';
import { Disclaimer } from '@/components/disclaimer';
import { PageHeader } from '@/components/page-header';
import { ForeignChangesCard } from '@/components/foreign/foreign-changes-card';
import { ForeignEvolutionChart } from '@/components/foreign/foreign-evolution-chart';
import { ForeignManagersCard } from '@/components/foreign/foreign-managers-card';
import { ForeignOverviewTable } from '@/components/foreign/foreign-overview-table';
import { ForeignTopFlowsCard } from '@/components/foreign/foreign-top-flows-card';
import {
  getForeignChanges,
  getForeignDates,
  getForeignEvolution,
  getForeignManagers,
  getForeignSummary,
  getForeignTopFlows,
} from '@/lib/queries-foreign';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'changes', label: 'Changes' },
  { id: 'managers', label: 'Managers' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMonYY(fecha: string): string {
  const [y, m] = fecha.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; tab?: string }>;
}) {
  const { fecha: fechaParam, tab: tabParam } = await searchParams;
  const dates = await getForeignDates();
  const dateStrings = dates.map((d) => d.fecha);
  const fecha =
    fechaParam && dateStrings.includes(fechaParam) ? fechaParam : dateStrings[0];
  const tab: TabId = TABS.some((t) => t.id === tabParam)
    ? (tabParam as TabId)
    : 'overview';

  if (!fecha) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data available.</p>
      </main>
    );
  }

  const [rows, changes, topFlows, managers, evolution] = await Promise.all([
    getForeignSummary(fecha),
    getForeignChanges(fecha),
    getForeignTopFlows(fecha),
    getForeignManagers(fecha),
    getForeignEvolution(),
  ]);
  const source = dates.find((d) => d.fecha === fecha)?.source ?? 'CHIST';
  const endLabel = `${fmtMonYY(fecha)} USD mm`;
  const momLabel = `${fmtMonYY(changes.fechaMomStart)} USD mm`;
  const ytdLabel = `${fmtMonYY(changes.fechaYtdStart)} USD mm`;
  const ltmLabel = `${fmtMonYY(changes.fechaLtmStart)} USD mm`;
  const threeYLabel = `${fmtMonYY(changes.fechaThreeYStart)} USD mm`;
  // A baseline is "available" if (a) it exists in our dataset and (b) it is not
  // the same fecha as one already shown (avoids duplicate toggles e.g. in Jan
  // where YTD start = MoM start).
  const dateSet = new Set(dateStrings);
  const momAvailable = dateSet.has(changes.fechaMomStart);
  const ytdAvailable =
    dateSet.has(changes.fechaYtdStart) &&
    changes.fechaYtdStart !== changes.fechaMomStart;
  const ltmAvailable =
    dateSet.has(changes.fechaLtmStart) &&
    changes.fechaLtmStart !== changes.fechaMomStart &&
    changes.fechaLtmStart !== changes.fechaYtdStart;
  const threeYAvailable = dateSet.has(changes.fechaThreeYStart);

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Foreign Investment"
        subtitle="AFP Chile · system view at month-end"
        dates={dateStrings}
        currentDate={fecha}
      >
        <span
          className={
            source === 'SP_XML'
              ? 'inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-300'
              : 'inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'
          }
          title={
            source === 'SP_XML'
              ? 'Source: SP aggregated XML (no lag, ~94% emisores classified via ISIN)'
              : 'Source: CHIST regulatory filing (4-month lag, full classification)'
          }
        >
          {source === 'SP_XML' ? 'SP XML' : 'CHIST'}
        </span>
      </PageHeader>

      <TabNav current={tab} tabs={TABS} />

      <Disclaimer variant="foreign-lag" />

      {tab === 'overview' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Foreign Investment — Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ForeignOverviewTable rows={rows} />
            </CardContent>
          </Card>

          <ForeignEvolutionChart history={evolution} />
        </>
      )}

      {tab === 'changes' && (
        <>
          <ForeignChangesCard
            endRows={changes.endRows}
            momStartRows={changes.momStartRows}
            ytdStartRows={changes.ytdStartRows}
            ltmStartRows={changes.ltmStartRows}
            threeYStartRows={changes.threeYStartRows}
            endLabel={endLabel}
            momLabel={momLabel}
            ytdLabel={ytdLabel}
            ltmLabel={ltmLabel}
            threeYLabel={threeYLabel}
            momPeriod={`${fmtMonYY(changes.fechaMomStart)} → ${fmtMonYY(fecha)}`}
            ytdPeriod={`${fmtMonYY(changes.fechaYtdStart)} → ${fmtMonYY(fecha)}`}
            ltmPeriod={`${fmtMonYY(changes.fechaLtmStart)} → ${fmtMonYY(fecha)}`}
            threeYPeriod={`${fmtMonYY(changes.fechaThreeYStart)} → ${fmtMonYY(fecha)}`}
            momAvailable={momAvailable}
            ytdAvailable={ytdAvailable}
            ltmAvailable={ltmAvailable}
            threeYAvailable={threeYAvailable}
          />

          <ForeignTopFlowsCard
            mom={topFlows.mom}
            ytd={topFlows.ytd}
            momPeriod={`${fmtMonYY(topFlows.fechaMomStart)} → ${fmtMonYY(fecha)}`}
            ytdPeriod={`${fmtMonYY(topFlows.fechaYtdStart)} → ${fmtMonYY(fecha)}`}
          />
        </>
      )}

      {tab === 'managers' && <ForeignManagersCard rows={managers} />}
    </main>
  );
}
