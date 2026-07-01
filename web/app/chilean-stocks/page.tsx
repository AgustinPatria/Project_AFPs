export const revalidate = 3600;

import { ChileanStocksGicsCard } from '@/components/chilean-stocks/chilean-stocks-gics-card';
import { ChileanStocksTransactionsCard } from '@/components/chilean-stocks/chilean-stocks-transactions-card';
import { Sec05SizeCard } from '@/components/chilean-stocks/sec05-size-card';
import { Sec05IpsaMembershipCard } from '@/components/chilean-stocks/sec05-ipsa-membership-card';
import { Sec05ConcentrationCard } from '@/components/chilean-stocks/sec05-concentration-card';
import { Sec05Top40Card } from '@/components/chilean-stocks/sec05-top40-card';
import { PageHeader } from '@/components/page-header';
import { AsOfBadge } from '@/components/as-of-badge';
import {
  getChileanStocksDates,
  getChileanStocksGicsBreakdown,
  getChileanStocksTopFlows,
} from '@/lib/queries-chilean-stocks';
import {
  getSec05SizeBreakdown,
  getSec05IpsaMembership,
  getSec05Concentration,
  getSec05Top40,
  getSec05ResolvedFechas,
} from '@/lib/queries-sec05';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMonYY(fecha: string): string {
  const [y, m] = fecha.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha: fechaParam } = await searchParams;
  const dates = await getChileanStocksDates();
  const fecha = fechaParam && dates.includes(fechaParam) ? fechaParam : dates[0];

  if (!fecha) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data available.</p>
      </main>
    );
  }

  const [
    topFlows,
    gicsBreakdown,
    sizeBreakdown,
    ipsaMembership,
    concentration,
    top40,
    resolvedFechas,
  ] = await Promise.all([
    getChileanStocksTopFlows(fecha),
    getChileanStocksGicsBreakdown(fecha),
    getSec05SizeBreakdown(fecha),
    getSec05IpsaMembership(fecha),
    getSec05Concentration(fecha),
    getSec05Top40(fecha),
    getSec05ResolvedFechas(fecha),
  ]);

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Chilean Stocks"
        subtitle="Sec 05 · PIONERO · MRV · IPSA · AFPs · each column aligned to closest available date ≤ selected"
        dates={dates}
        currentDate={fecha}
      >
        <AsOfBadge module="chilean_stocks" />
      </PageHeader>

      <div className="flex justify-end">
        <AsOfBadge module="chilean_stocks" source="Pionero/MRV (IPD)" />
      </div>

      {/* Sec05 sobre SQL vivo (2026-07-01): Pionero/MRV = TBL_IPA_V2 type=2,
          índices/size = TBL_BMS_Exposicion (IGPA L/M/S + IPSA), AFPs = CHIST.
          Cuartiles reemplazados por size. Sin seeds JSON. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Sec05SizeCard
          rows={sizeBreakdown}
          fechas={resolvedFechas}
          targetFecha={fecha}
        />
        <Sec05IpsaMembershipCard rows={ipsaMembership} fechas={resolvedFechas} />
      </div>

      <Sec05ConcentrationCard rows={concentration} fechas={resolvedFechas} />

      <Sec05Top40Card rows={top40} />

      <ChileanStocksGicsCard data={gicsBreakdown} />

      <ChileanStocksTransactionsCard
        mtd={topFlows.mtd}
        ytd={topFlows.ytd}
        ltm={topFlows.ltm}
        mtdPeriod={`${fmtMonYY(topFlows.fechaMtdStart)} → ${fmtMonYY(fecha)}`}
        ytdPeriod={`${fmtMonYY(topFlows.fechaYtdStart)} → ${fmtMonYY(fecha)}`}
        ltmPeriod={`${fmtMonYY(topFlows.fechaLtmStart)} → ${fmtMonYY(fecha)}`}
      />
    </main>
  );
}
