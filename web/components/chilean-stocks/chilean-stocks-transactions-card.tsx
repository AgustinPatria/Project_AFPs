'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fmtUsdMM } from '@/lib/format';
import type {
  ChileanFlowsBucket,
  ChileanStockIssuerRow,
} from '@/lib/queries-chilean-stocks';
import { cn } from '@/lib/utils';

type Period = 'mtd' | 'ytd' | 'ltm';

type Props = {
  mtd: ChileanFlowsBucket;
  ytd: ChileanFlowsBucket;
  ltm: ChileanFlowsBucket;
  mtdPeriod: string;
  ytdPeriod: string;
  ltmPeriod: string;
};

const PERIOD_LABEL: Record<Period, string> = {
  mtd: 'MTD',
  ytd: 'YTD',
  ltm: 'LTM',
};

export function ChileanStocksTransactionsCard({
  mtd,
  ytd,
  ltm,
  mtdPeriod,
  ytdPeriod,
  ltmPeriod,
}: Props) {
  const [period, setPeriod] = useState<Period>('mtd');
  const buckets: Record<Period, ChileanFlowsBucket> = { mtd, ytd, ltm };
  const periodLabels: Record<Period, string> = {
    mtd: mtdPeriod,
    ytd: ytdPeriod,
    ltm: ltmPeriod,
  };
  const active = buckets[period];

  const hasData = active.purchases.length > 0 || active.sales.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-sm font-medium">
              Chilean Stocks Transactions ({periodLabels[period]})
            </CardTitle>
            <p className="text-[11px] text-muted-foreground max-w-2xl">
              Pure transaction flows per issuer using CHIST{' '}
              <code>inv_end − inv_start × (price_end / price_start)</code>{' '}
              (equivalent to <code>(units_end − units_start) × price_end</code>{' '}
              but immune to the LATAM units integer-overflow in CHIST). Matches
              PDF Sec 06 to the dollar on most issuers; two known outliers
              (CENCOMALLS spin-off, LTM post-Chapter-11 share count) where the
              legacy applies bespoke handling. Only fechas inside CHIST coverage
              (≤ Nov-25); for SP XML fechas, units are not published and the
              card shows no data.
            </p>
          </div>
          <SegmentedControl
            ariaLabel="Period"
            value={period}
            onChange={setPeriod}
            options={(['mtd', 'ytd', 'ltm'] as const).map((p) => ({
              value: p as Period,
              label: PERIOD_LABEL[p],
            }))}
          />
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-xs text-muted-foreground">
            Transaction flows are only computed for fechas inside CHIST coverage
            (≤ Nov-25). Select an earlier date to see purchases and sales.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-2 text-xs">
              <span className="text-muted-foreground uppercase tracking-wide">
                Total Net (Purchases − Sales)
              </span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  active.totalNet > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : active.totalNet < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground',
                )}
              >
                {fmtUsdMM(active.totalNet)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <FlowList
                title="Net Purchases (Top 10)"
                rows={active.purchases}
                tone="positive"
              />
              <FlowList
                title="Net Sales (Top 10)"
                rows={active.sales}
                tone="negative"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FlowList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: ChileanStockIssuerRow[];
  tone: 'positive' | 'negative';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400';
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No data.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.emisor}
              className="flex items-baseline justify-between gap-3 text-xs border-b border-border/50 py-1.5 last:border-b-0"
            >
              <span className="truncate pr-2" title={r.emisor}>
                {r.emisor}
              </span>
              <span className={cn('tabular-nums shrink-0', valueClass)}>
                {tone === 'positive' ? '+' : ''}
                {fmtUsdMM(r.monto_usd_mm)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
