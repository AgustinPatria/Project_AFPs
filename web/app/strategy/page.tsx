import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Disclaimer } from '@/components/disclaimer';
import { PageHeader } from '@/components/page-header';
import {
  LocalEquityAreaChart,
  LocalEquityTable,
} from '@/components/strategy/local-equity-charts';
import {
  StrategyPieChart,
  StrategyTimeSeriesChart,
} from '@/components/strategy/strategy-charts';
import { StrategyFamilySelector } from '@/components/strategy/strategy-family-selector';
import { fmtUsdMM } from '@/lib/format';
import {
  getLocalEquityHistory,
  getStrategyDates,
  getStrategyDetail,
  getStrategyFamilies,
  type LocalEquityPoint,
} from '@/lib/queries-strategy';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonYY(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}
function periodoToDateStr(periodo: string): string {
  // YYYY-MM-DD (last day of month) for the date selector.
  const [y, m] = periodo.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Picks up to 5 snapshot rows mirroring the PDF table: last 3 year-end snapshots
// (the last observation in each prior year) + previous month + current month.
// Falls back gracefully when historical years aren't yet backfilled.
function pickSnapshotRows(history: LocalEquityPoint[]): LocalEquityPoint[] {
  if (history.length === 0) return [];
  const sorted = [...history].sort((a, b) =>
    a.fecha_reporte.localeCompare(b.fecha_reporte),
  );
  const byYear = new Map<string, LocalEquityPoint>();
  for (const p of sorted) byYear.set(p.fecha_reporte.slice(0, 4), p);

  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const currentYear = last.fecha_reporte.slice(0, 4);
  const historicalYearEnds = Array.from(byYear.entries())
    .filter(([year]) => year !== currentYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-3)
    .map(([, p]) => p);

  const result: LocalEquityPoint[] = [...historicalYearEnds];
  if (prev && prev.fecha_reporte !== last.fecha_reporte) result.push(prev);
  result.push(last);
  return result;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ family?: string; periodo?: string; fecha?: string }>;
}) {
  const sp = await searchParams;
  const families = await getStrategyFamilies();
  if (families.length === 0) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No families configured.</p>
      </main>
    );
  }

  const familyParam = sp.family ? Number(sp.family) : NaN;
  const family_id = families.some((f) => f.family_id === familyParam)
    ? familyParam
    : families[0].family_id;

  // Family 11 = Local Equity DI vs IF — completely different shape (no peers,
  // pure CHIST/SP XML aggregation with stacked area chart and a table snapshot).
  if (family_id === 11) {
    const history = await getLocalEquityHistory();
    const snapshotRows = pickSnapshotRows(history);
    return (
      <main className="p-6 lg:p-8 space-y-6">
        <PageHeader
          title="Strategy"
          subtitle="Market share by Asset Class · Local Equity Direct vs Investment Funds"
          titleIcon={<Target className="h-5 w-5" />}
        >
          <StrategyFamilySelector families={families} current={family_id} />
        </PageHeader>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Local Equity</CardTitle>
          </CardHeader>
          <CardContent>
            <LocalEquityTable rows={snapshotRows} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Local Equity Evolution</CardTitle>
          </CardHeader>
          <CardContent>
            <LocalEquityAreaChart history={history} />
          </CardContent>
        </Card>
      </main>
    );
  }

  const periodos = await getStrategyDates(family_id);

  // Accept both ?periodo=YYYY-MM and ?fecha=YYYY-MM-DD.
  let periodo = sp.periodo;
  if (!periodo && sp.fecha) periodo = sp.fecha.slice(0, 7);
  if (!periodo || !periodos.includes(periodo)) periodo = periodos[0];
  if (!periodo) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data for this family.</p>
      </main>
    );
  }

  // Family 10 (Top 10 HY combined) collapses peers beyond top 10 into "Other",
  // matching PDF 04 page 9. Other families show all peers individually.
  const rollupAfter = family_id === 10 ? 10 : undefined;
  const detail = await getStrategyDetail(family_id, periodo, rollupAfter);
  if (!detail) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data for this family/period.</p>
      </main>
    );
  }

  const dateStrings = periodos.map(periodoToDateStr);
  const currentFecha = periodoToDateStr(periodo);

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Strategy"
        subtitle={`Market share by Asset Class · ${detail.family.family_name} · ${fmtMonYY(periodo)}`}
        titleIcon={<Target className="h-5 w-5" />}
        dates={dateStrings}
        currentDate={currentFecha}
      >
        <StrategyFamilySelector families={families} current={family_id} />
      </PageHeader>

      <Disclaimer>
        <strong>Strategy view.</strong> All {families.length} strategies are
        covered by <code>dim_bd_family_comp</code>. Some peers may differ from
        the PDF when the legacy GLOBAL_HY/peer sheets miss a share class — e.g.
        Aegon HY Global here reflects both ISINs held by AFPs (
        <code>IE00BMC6R191</code> + <code>IE000ZQ4NK26</code>, ~1,471 USD mm),
        while the PDF only lists the first one (~581) because the second was
        never added to the legacy peer sheet. Other minor classification
        differences exist (e.g. Ninety One Latam Corp Debt).
      </Disclaimer>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Market Share — {detail.family.family_name} ({fmtMonYY(periodo)})
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Total AUM: {fmtUsdMM(detail.totalUsdMm)} across{' '}
            {detail.snapshot.length} fund{detail.snapshot.length === 1 ? '' : 's'}
          </p>
        </CardHeader>
        <CardContent>
          <StrategyPieChart snapshot={detail.snapshot} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Evolution</CardTitle>
        </CardHeader>
        <CardContent>
          <StrategyTimeSeriesChart series={detail.timeSeries} />
        </CardContent>
      </Card>
    </main>
  );
}
