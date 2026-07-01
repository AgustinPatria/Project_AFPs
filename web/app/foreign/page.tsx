export const revalidate = 3600;

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabNav } from '@/components/ui/tab-nav';
import { Disclaimer } from '@/components/disclaimer';
import { PageHeader } from '@/components/page-header';
import { AsOfBadge } from '@/components/as-of-badge';
import { ForeignChangesCard } from '@/components/foreign/foreign-changes-card';
import { ForeignDirectInvestmentDetail } from '@/components/foreign/foreign-di-detail';
import { ForeignEvolutionChart } from '@/components/foreign/foreign-evolution-chart';
import { ForeignEvolutionTabs } from '@/components/foreign/foreign-evolution-tabs';
import { ForeignLatamCharts } from '@/components/foreign/foreign-latam-charts';
import { ForeignManagersCard } from '@/components/foreign/foreign-managers-card';
import { ForeignOverviewTable } from '@/components/foreign/foreign-overview-table';
import { ForeignTaxonomyToggle } from '@/components/foreign/foreign-taxonomy-toggle';
import { ForeignTopFlowsCard } from '@/components/foreign/foreign-top-flows-card';
import type { ForeignTaxonomy } from '@/lib/types-foreign';
import {
  getForeignChanges,
  getForeignChangesSplits,
  getForeignDates,
  getForeignEvolution,
  getForeignManagers,
  getForeignSummary,
  getForeignTopFlows,
} from '@/lib/queries-foreign';
import { getForeignDirectInvestmentDetail } from '@/lib/queries-foreign-di';
import { getAssetClassEvolution } from '@/lib/queries-foreign-evolution';
import { getLatamEvolution } from '@/lib/queries-foreign-latam';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'changes', label: 'Changes' },
  { id: 'evolution', label: 'Evolution' },
  { id: 'direct', label: 'Direct Inv' },
  { id: 'latam', label: 'Latam' },
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
  searchParams: Promise<{ fecha?: string; tab?: string; tax?: string }>;
}) {
  const { fecha: fechaParam, tab: tabParam, tax: taxParam } = await searchParams;
  const dates = await getForeignDates();
  const dateStrings = dates.map((d) => d.fecha);
  const fecha =
    fechaParam && dateStrings.includes(fechaParam) ? fechaParam : dateStrings[0];
  const tab: TabId = TABS.some((t) => t.id === tabParam)
    ? (tabParam as TabId)
    : 'overview';
  // New taxonomy is the default; `?tax=legacy` falls back to the PDF buckets.
  const taxonomy: ForeignTaxonomy = taxParam === 'legacy' ? 'legacy' : 'nt';

  if (!fecha) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data available.</p>
      </main>
    );
  }

  // Only fetch what the active tab renders — every query here is a Supabase
  // round-trip, and fetching all tabs on every navigation is what made tab
  // switches slow. Inactive tabs resolve to empty placeholders.
  const [rows, evolution, changes, splits, topFlows, managers, latam, directInv, fiEvo, eqEvo] =
    await Promise.all([
      tab === 'overview' ? getForeignSummary(fecha, taxonomy) : Promise.resolve([]),
      tab === 'overview' ? getForeignEvolution() : Promise.resolve([]),
      tab === 'changes' ? getForeignChanges(fecha, taxonomy) : Promise.resolve(null),
      tab === 'changes' ? getForeignChangesSplits(fecha, taxonomy) : Promise.resolve(null),
      tab === 'changes' ? getForeignTopFlows(fecha) : Promise.resolve(null),
      tab === 'managers' ? getForeignManagers(fecha) : Promise.resolve([]),
      tab === 'latam' ? getLatamEvolution() : Promise.resolve([]),
      tab === 'direct' ? getForeignDirectInvestmentDetail(fecha) : Promise.resolve(null),
      tab === 'evolution' ? getAssetClassEvolution('Fixed Income') : Promise.resolve([]),
      tab === 'evolution' ? getAssetClassEvolution('Equity') : Promise.resolve([]),
    ]);
  const source = dates.find((d) => d.fecha === fecha)?.source ?? 'CHIST';
  const endLabel = `${fmtMonYY(fecha)} USD mm`;
  // A baseline is "available" if (a) it exists in our dataset and (b) it is not
  // the same fecha as one already shown (avoids duplicate toggles e.g. in Jan
  // where YTD start = MoM start).
  const dateSet = new Set(dateStrings);
  const momAvailable = changes != null && dateSet.has(changes.fechaMomStart);
  const threeMAvailable =
    changes != null &&
    dateSet.has(changes.fechaThreeMStart) &&
    changes.fechaThreeMStart !== changes.fechaMomStart;
  const sixMAvailable =
    changes != null &&
    dateSet.has(changes.fechaSixMStart) &&
    changes.fechaSixMStart !== changes.fechaMomStart &&
    changes.fechaSixMStart !== changes.fechaThreeMStart;
  const ytdAvailable =
    changes != null &&
    dateSet.has(changes.fechaYtdStart) &&
    changes.fechaYtdStart !== changes.fechaMomStart &&
    changes.fechaYtdStart !== changes.fechaThreeMStart &&
    changes.fechaYtdStart !== changes.fechaSixMStart;
  const ltmAvailable =
    changes != null &&
    dateSet.has(changes.fechaLtmStart) &&
    changes.fechaLtmStart !== changes.fechaMomStart &&
    changes.fechaLtmStart !== changes.fechaThreeMStart &&
    changes.fechaLtmStart !== changes.fechaSixMStart &&
    changes.fechaLtmStart !== changes.fechaYtdStart;
  const threeYAvailable = changes != null && dateSet.has(changes.fechaThreeYStart);

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Foreign Investment"
        subtitle="AFP Chile · system view at month-end"
        dates={dateStrings}
        currentDate={fecha}
      >
        <AsOfBadge module="foreign" />
        {(tab === 'overview' || tab === 'changes') && (
          <ForeignTaxonomyToggle current={taxonomy} />
        )}
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
          <Disclaimer>
            <strong>Taxonomy.</strong> Buckets default to the new fund taxonomy
            (<code>BD_Funds</code>): <code>Alternative</code> folds the old
            AR/HF into Private Equity, and regions add Brazil / RoW (EM) with
            Chile treated as local. Switch to <em>Legacy (PDF)</em> in the header
            to reproduce the PDF Sec 07 buckets. The grand total is identical
            either way — only the breakdown changes.
          </Disclaimer>

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

      {tab === 'changes' && changes && splits && topFlows && (
        <>
          <div className="flex justify-end">
            <AsOfBadge module="foreign" source="Retornos (Bloomberg)" />
          </div>
          <ForeignChangesCard
            endRows={changes.endRows}
            momStartRows={changes.momStartRows}
            threeMStartRows={changes.threeMStartRows}
            sixMStartRows={changes.sixMStartRows}
            ytdStartRows={changes.ytdStartRows}
            ltmStartRows={changes.ltmStartRows}
            threeYStartRows={changes.threeYStartRows}
            endLabel={endLabel}
            momLabel={`${fmtMonYY(changes.fechaMomStart)} USD mm`}
            threeMLabel={`${fmtMonYY(changes.fechaThreeMStart)} USD mm`}
            sixMLabel={`${fmtMonYY(changes.fechaSixMStart)} USD mm`}
            ytdLabel={`${fmtMonYY(changes.fechaYtdStart)} USD mm`}
            ltmLabel={`${fmtMonYY(changes.fechaLtmStart)} USD mm`}
            threeYLabel={`${fmtMonYY(changes.fechaThreeYStart)} USD mm`}
            momPeriod={`${fmtMonYY(changes.fechaMomStart)} → ${fmtMonYY(fecha)}`}
            threeMPeriod={`${fmtMonYY(changes.fechaThreeMStart)} → ${fmtMonYY(fecha)}`}
            sixMPeriod={`${fmtMonYY(changes.fechaSixMStart)} → ${fmtMonYY(fecha)}`}
            ytdPeriod={`${fmtMonYY(changes.fechaYtdStart)} → ${fmtMonYY(fecha)}`}
            ltmPeriod={`${fmtMonYY(changes.fechaLtmStart)} → ${fmtMonYY(fecha)}`}
            threeYPeriod={`${fmtMonYY(changes.fechaThreeYStart)} → ${fmtMonYY(fecha)}`}
            momAvailable={momAvailable}
            threeMAvailable={threeMAvailable}
            sixMAvailable={sixMAvailable}
            ytdAvailable={ytdAvailable}
            ltmAvailable={ltmAvailable}
            threeYAvailable={threeYAvailable}
            momSplit={splits.mom}
            threeMSplit={splits.threeM}
            sixMSplit={splits.sixM}
            ytdSplit={splits.ytd}
            ltmSplit={splits.ltm}
            threeYSplit={splits.threeY}
          />

          <ForeignTopFlowsCard
            mom={topFlows.mom}
            ytd={topFlows.ytd}
            momPeriod={`${fmtMonYY(topFlows.fechaMomStart)} → ${fmtMonYY(fecha)}`}
            ytdPeriod={`${fmtMonYY(topFlows.fechaYtdStart)} → ${fmtMonYY(fecha)}`}
          />
        </>
      )}

      {tab === 'evolution' && (
        <ForeignEvolutionTabs fiSeries={fiEvo} eqSeries={eqEvo} />
      )}

      {tab === 'direct' && directInv && (
        <ForeignDirectInvestmentDetail
          fechas={directInv.fechas}
          rows={directInv.rows}
        />
      )}

      {tab === 'latam' && <ForeignLatamCharts series={latam} />}

      {tab === 'managers' && <ForeignManagersCard rows={managers} />}
    </main>
  );
}
