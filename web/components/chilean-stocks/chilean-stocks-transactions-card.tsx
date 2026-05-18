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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-medium">
                Chilean Stocks Transactions ({periodLabels[period]})
              </CardTitle>
              <span
                className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
                title="Approximation only — see note below"
              >
                Approx
              </span>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 max-w-2xl">
              <strong>Does not match PDF.</strong> Values are <code>end − start</code>{' '}
              of monto USD per issuer, which mixes purchases/sales with price
              moves. PDF 06 uses CHIST <code>units × price</code> to isolate
              pure transaction flows; SP XML (the only source for Dec-25 →) does
              not include units, so this view cannot be reproduced exactly until
              CHIST publishes the matching fechas.
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
