export const revalidate = 3600;

import { Disclaimer } from '@/components/disclaimer';
import { PageHeader } from '@/components/page-header';
import { SourceBadge } from '@/components/source-badge';
import { AsOfBadge } from '@/components/as-of-badge';
import { ForeignManagersCard } from '@/components/foreign/foreign-managers-card';
import { getForeignDates, getForeignManagers } from '@/lib/queries-foreign';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha: fechaParam } = await searchParams;
  const dates = await getForeignDates();
  const dateStrings = dates.map((d) => d.fecha);
  const fecha =
    fechaParam && dateStrings.includes(fechaParam) ? fechaParam : dateStrings[0];

  if (!fecha) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data available.</p>
      </main>
    );
  }

  const managers = await getForeignManagers(fecha);
  const source = dates.find((d) => d.fecha === fecha)?.source ?? 'CHIST';

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Managers"
        subtitle="Foreign holdings aggregated by fund manager"
        dates={dateStrings}
        currentDate={fecha}
      >
        <SourceBadge dataset="sec09_isin_classification" />
        <AsOfBadge module="managers" />
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

      <Disclaimer variant="foreign-lag" />

      <Disclaimer>
        <strong>Managers view.</strong> Totals match the PDF Sec 10 within
        ±1%, but per-manager rows can diverge for three known reasons. (1){' '}
        <em>Sub-brand grouping</em>: the PDF folds ETF brands into their parent
        (e.g. <code>x-trackers</code> → Deutsche); the dashboard now applies the
        same alias. (2) <em>Region attribution</em>: dim_bd_funds tags region
        by underlying market, the PDF by domicile — e.g. DWS Latin American
        Equities (a Luxembourg UCITS, ~1.87 USD bn) shows in <code>Latam</code>{' '}
        here vs <code>Europe</code> in the PDF. (3) <em>Legacy coverage</em>:
        the PDF Excel is built from a manually maintained universe and can miss
        funds present in CHIST — e.g. BNP Paribas Japan Small Cap (214) and BNP
        Paribas Russia Equity (34) appear here but not in the PDF, same pattern
        as the Aegon HY share-class gap flagged on /strategy.
      </Disclaimer>

      <Disclaimer>
        <strong>Taxonomy.</strong> The FI category columns default to the new
        fund taxonomy (<code>BD_Funds</code>: Sub Asset Class / Sub-Category).
        Switch the selector to <em>Legacy</em> to reproduce the{' '}
        <code>dim_bd_funds.category</code> buckets used by the PDF Sec 10. The
        EM/DM split and region columns still use the legacy region.
      </Disclaimer>

      <ForeignManagersCard rows={managers} />
    </main>
  );
}
