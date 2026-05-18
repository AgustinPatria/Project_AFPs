import { ChileanStocksGicsCard } from '@/components/chilean-stocks/chilean-stocks-gics-card';
import { ChileanStocksTransactionsCard } from '@/components/chilean-stocks/chilean-stocks-transactions-card';
import { PageHeader } from '@/components/page-header';
import {
  getChileanStocksDates,
  getChileanStocksGicsBreakdown,
  getChileanStocksTopFlows,
} from '@/lib/queries-chilean-stocks';

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

  const [topFlows, gicsBreakdown] = await Promise.all([
    getChileanStocksTopFlows(fecha),
    getChileanStocksGicsBreakdown(fecha),
  ]);

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Chilean Stocks"
        subtitle="AFP Chile · system view at month-end"
        dates={dates}
        currentDate={fecha}
      />

      <ChileanStocksTransactionsCard
        mtd={topFlows.mtd}
        ytd={topFlows.ytd}
        ltm={topFlows.ltm}
        mtdPeriod={`${fmtMonYY(topFlows.fechaMtdStart)} → ${fmtMonYY(fecha)}`}
        ytdPeriod={`${fmtMonYY(topFlows.fechaYtdStart)} → ${fmtMonYY(fecha)}`}
        ltmPeriod={`${fmtMonYY(topFlows.fechaLtmStart)} → ${fmtMonYY(fecha)}`}
      />

      <ChileanStocksGicsCard data={gicsBreakdown} />
    </main>
  );
}
