'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fmtUsdMM } from '@/lib/format';
import type { FundDeltaRow } from '@/lib/queries-foreign';
import { cn } from '@/lib/utils';

type View = 'mom' | 'ytd';

type Props = {
  mom: { inflows: FundDeltaRow[]; outflows: FundDeltaRow[] };
  ytd: { inflows: FundDeltaRow[]; outflows: FundDeltaRow[] };
  momPeriod: string;
  ytdPeriod: string;
};

export function ForeignTopFlowsCard({ mom, ytd, momPeriod, ytdPeriod }: Props) {
  const [view, setView] = useState<View>('mom');
  const active = view === 'mom' ? mom : ytd;
  const period = view === 'mom' ? momPeriod : ytdPeriod;
  const hasData = active.inflows.length > 0 || active.outflows.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-sm font-medium">
              Top Net Inflows and Outflows — Foreign Funds · Sec 08 ({period})
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-3xl">
              Net flow per fund = position change − return, using Bloomberg
              monthly USD total returns per ISIN (the exact PDF Sec 08
              methodology), with share classes consolidated per fund. YTD is
              the sum of monthly flows over the months with Bloomberg returns
              data. Validated vs the Mar-26 PDF: top-10 outflows match to
              the decimal. <strong>Inflows may surface funds the PDF
              omits</strong> — the legacy flows matrix silently truncates the
              last ~120 instruments of its classification sheet; this view
              covers all of them.
            </p>
          </div>
          <SegmentedControl
            ariaLabel="Period"
            value={view}
            onChange={setView}
            options={[
              { value: 'mom' as View, label: 'Monthly' },
              { value: 'ytd' as View, label: 'YTD' },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-xs text-muted-foreground">
            No flows for this period yet — Bloomberg returns for the month have
            not been synced (flows are available for the months with Bloomberg
            returns data). Select an earlier date.
          </p>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <FlowList
            title="Net Inflows (Top 10)"
            rows={active.inflows}
            tone="positive"
          />
          <FlowList
            title="Net Outflows (Top 10)"
            rows={active.outflows}
            tone="negative"
          />
        </div>
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
  rows: FundDeltaRow[];
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
              key={r.fund_id}
              className="flex items-baseline justify-between gap-3 text-xs border-b border-border/50 py-1.5 last:border-b-0"
            >
              <span className="truncate pr-2" title={r.fondo}>
                {r.fondo}
              </span>
              <span className={cn('tabular-nums shrink-0', valueClass)}>
                {tone === 'positive' ? '+' : ''}
                {fmtUsdMM(r.delta_usd_mm)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
