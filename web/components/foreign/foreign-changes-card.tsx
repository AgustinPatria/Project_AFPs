'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ForeignChangesTable } from './foreign-changes-table';
import type { ForeignSplit, ForeignSummaryRow } from '@/lib/types-foreign';

type View = 'mom' | 'ytd' | 'ltm' | '3y';

type ViewConfig = {
  id: View;
  label: string;
  startRows: ForeignSummaryRow[];
  startLabel: string;
  period: string;
  available: boolean;
  split: ForeignSplit;
};

type Props = {
  endRows: ForeignSummaryRow[];
  momStartRows: ForeignSummaryRow[];
  ytdStartRows: ForeignSummaryRow[];
  ltmStartRows: ForeignSummaryRow[];
  threeYStartRows: ForeignSummaryRow[];
  endLabel: string;
  momLabel: string;
  ytdLabel: string;
  ltmLabel: string;
  threeYLabel: string;
  momPeriod: string;
  ytdPeriod: string;
  ltmPeriod: string;
  threeYPeriod: string;
  momAvailable: boolean;
  ytdAvailable: boolean;
  ltmAvailable: boolean;
  threeYAvailable: boolean;
  momSplit: ForeignSplit;
  ytdSplit: ForeignSplit;
  ltmSplit: ForeignSplit;
  threeYSplit: ForeignSplit;
};

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMonYY(fecha: string): string {
  const [y, m] = fecha.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

export function ForeignChangesCard(props: Props) {
  const views: ViewConfig[] = [
    {
      id: 'mom',
      label: 'Monthly',
      startRows: props.momStartRows,
      startLabel: props.momLabel,
      period: props.momPeriod,
      available: props.momAvailable,
      split: props.momSplit,
    },
    {
      id: 'ytd',
      label: 'YTD',
      startRows: props.ytdStartRows,
      startLabel: props.ytdLabel,
      period: props.ytdPeriod,
      available: props.ytdAvailable,
      split: props.ytdSplit,
    },
    {
      id: 'ltm',
      label: 'LTM',
      startRows: props.ltmStartRows,
      startLabel: props.ltmLabel,
      period: props.ltmPeriod,
      available: props.ltmAvailable,
      split: props.ltmSplit,
    },
    {
      id: '3y',
      label: '3Y',
      startRows: props.threeYStartRows,
      startLabel: props.threeYLabel,
      period: props.threeYPeriod,
      available: props.threeYAvailable,
      split: props.threeYSplit,
    },
  ];

  // Default to first available view (MoM if it exists, otherwise the next one).
  const firstAvailable = views.find((v) => v.available)?.id ?? 'mom';
  const [view, setView] = useState<View>(firstAvailable);
  const active = views.find((v) => v.id === view) ?? views[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-sm font-medium">
            Foreign Investment — Changes ({active.period})
          </CardTitle>
          <SegmentedControl
            ariaLabel="Change period"
            value={view}
            onChange={setView}
            options={views.map((v) => ({
              value: v.id,
              label: v.label,
              disabled: !v.available,
              title: v.available
                ? v.period
                : 'Baseline date not available in dataset',
            }))}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {active.split.covered.length === 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90 leading-relaxed">
            <strong className="font-medium">
              Return/Flow split not available for this window.
            </strong>{' '}
            Bloomberg returns are synced from Feb-25 onwards; this window falls
            outside that range, so only Total Change (end − start) is shown.
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
            <strong className="font-medium text-foreground">
              Return/Flow split (PDF methodology).
            </strong>{' '}
            Per instrument and month: Return = prior-month position × Bloomberg
            monthly USD total return; Flow = position change − Return. Covers
            Equity, Fixed Income and Private Equity funds — Direct Investment
            and the grand total show Total Change only.
            {active.split.missing.length > 0 && (
              <>
                {' '}
                <span className="text-amber-600 dark:text-amber-300">
                  Partial window: split aggregated over{' '}
                  {fmtMonYY(active.split.covered[0])} →{' '}
                  {fmtMonYY(active.split.covered[active.split.covered.length - 1])}
                  ; no returns data for{' '}
                  {active.split.missing.map(fmtMonYY).join(', ')} (Return + Flow
                  may not equal Total Change).
                </span>
              </>
            )}
          </div>
        )}
        <ForeignChangesTable
          endRows={props.endRows}
          startRows={active.startRows}
          startLabel={active.startLabel}
          endLabel={props.endLabel}
          returnRows={active.split.returnRows}
          flowRows={active.split.flowRows}
          splitAvailable={active.split.covered.length > 0}
        />
      </CardContent>
    </Card>
  );
}
