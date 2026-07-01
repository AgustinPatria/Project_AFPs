export const revalidate = 3600;

import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Disclaimer } from '@/components/disclaimer';
import { PageHeader } from '@/components/page-header';
import { AsOfBadge } from '@/components/as-of-badge';
import {
  LocalEquityAreaChart,
  LocalEquityTable,
} from '@/components/strategy/local-equity-charts';
import {
  StrategyPieChart,
  StrategyTimeSeriesChart,
} from '@/components/strategy/strategy-charts';
import { StrategyFamilySelector } from '@/components/strategy/strategy-family-selector';
import { StrategyAfpOwUwTable } from '@/components/strategy/afp-ow-uw-table';
import {
  CarteraCard,
  ContributorsCard,
  ReturnsAumCard,
} from '@/components/strategy/attribution-cards';
import { fmtUsdMM } from '@/lib/format';
import {
  getLocalEquityHistory,
  getStrategyAfpOwUw,
  getStrategyDates,
  getStrategyDetail,
  getStrategyFamilies,
  type LocalEquityPoint,
} from '@/lib/queries-strategy';
import {
  getFundAttribution,
  getFundCartera,
  getFundReturns,
  getStrategyIpdFunds,
} from '@/lib/queries-strategy-attribution';

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
          <AsOfBadge module="strategy" source="Local Equity DI (CHIST)" />
          <StrategyFamilySelector families={families} current={family_id} />
        </PageHeader>

        <Disclaimer>
          <strong>Taxonomy.</strong> The Investment Funds row uses the new fund
          taxonomy (<code>nt_asset_class='Equity'</code> AND{' '}
          <code>nt_region='Chile'</code>). For the Chilean-equity-fund universe
          the new and legacy classifications coincide, so the figures are
          unchanged from the PDF Sec 04.
        </Disclaimer>

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

  // 1.4 — per-AFP over/underweight in this family's Moneda funds (CHIST, lagged).
  const afpOwUw = await getStrategyAfpOwUw(family_id);

  // 4.1/4.2 — cartera + return contributors + return/AUM per Moneda fund
  // (dim_strategy_ipd_funds; family 9 CLO has no positions in IPD yet).
  const ipdFunds = await getStrategyIpdFunds(family_id);
  const fundBlocks = (
    await Promise.all(
      ipdFunds.map(async (fund) => {
        const [attribution, cartera, returns] = await Promise.all([
          getFundAttribution(fund.id_fund),
          getFundCartera(fund.id_fund),
          fund.rent_id_fund ? getFundReturns(fund.rent_id_fund) : Promise.resolve(null),
        ]);
        return { fund, attribution, cartera, returns };
      }),
    )
  ).filter((b) => b.attribution || b.cartera || b.returns);

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Strategy"
        subtitle={`Market share by Asset Class · ${detail.family.family_name} · ${fmtMonYY(periodo)}`}
        titleIcon={<Target className="h-5 w-5" />}
        dates={dateStrings}
        currentDate={currentFecha}
      >
        <AsOfBadge module="strategy" />
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

      {afpOwUw && afpOwUw.rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium">
                Positioning by AFP — {detail.family.family_name}
              </CardTitle>
              {/* Per-card vintage: this card is CHIST (lagged), unlike the
                  fresh SP market share above — surface it so the page's mixed
                  as-of dates are explicit rather than hidden in the footnote. */}
              <AsOfBadge module="strategy" source="Posicionamiento AFP (CHIST)" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Over / underweight in our Moneda funds vs the system average
            </p>
          </CardHeader>
          <CardContent>
            <StrategyAfpOwUwTable rows={afpOwUw.rows} fecha={afpOwUw.fecha} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Evolution</CardTitle>
        </CardHeader>
        <CardContent>
          <StrategyTimeSeriesChart series={detail.timeSeries} />
        </CardContent>
      </Card>

      {/* 4.1 / 4.2 — per Moneda fund: contributors, return/AUM, cartera.
          Data straight from Inteligencia_Producto (daily Geneva positions,
          aggregated monthly at sync time) — fresher than the SP world above. */}
      {fundBlocks.map(({ fund, attribution, cartera, returns }) => (
        <section key={fund.id_fund} className="space-y-6">
          {attribution && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">
                    Return contributors — {fund.fund_label}
                  </CardTitle>
                  <AsOfBadge module="strategy" source="Atribución Moneda (IPD)" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Top contributors / detractors, Price + FX/carry breakdown
                </p>
              </CardHeader>
              <CardContent>
                <ContributorsCard
                  month={attribution.month}
                  quarter={attribution.quarter}
                />
              </CardContent>
            </Card>
          )}

          {returns && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Return vs AUM — {fund.fund_label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReturnsAumCard returns={returns} />
              </CardContent>
            </Card>
          )}

          {cartera && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Portfolio — {fund.fund_label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CarteraCard
                  fecha={cartera.fecha}
                  navUsd={cartera.nav_usd}
                  rows={cartera.rows}
                />
              </CardContent>
            </Card>
          )}
        </section>
      ))}
    </main>
  );
}
