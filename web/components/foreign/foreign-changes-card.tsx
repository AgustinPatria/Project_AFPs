'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ForeignChangesTable } from './foreign-changes-table';
import type { ForeignSummaryRow } from '@/lib/types-foreign';

type View = 'mom' | 'ytd' | 'ltm' | '3y';

type ViewConfig = {
  id: View;
  label: string;
  startRows: ForeignSummaryRow[];
  startLabel: string;
  period: string;
  available: boolean;
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
};

export function ForeignChangesCard(props: Props) {
  const views: ViewConfig[] = [
    {
      id: 'mom',
      label: 'Monthly',
      startRows: props.momStartRows,
      startLabel: props.momLabel,
      period: props.momPeriod,
      available: props.momAvailable,
    },
    {
      id: 'ytd',
      label: 'YTD',
      startRows: props.ytdStartRows,
      startLabel: props.ytdLabel,
      period: props.ytdPeriod,
      available: props.ytdAvailable,
    },
    {
      id: 'ltm',
      label: 'LTM',
      startRows: props.ltmStartRows,
      startLabel: props.ltmLabel,
      period: props.ltmPeriod,
      available: props.ltmAvailable,
    },
    {
      id: '3y',
      label: '3Y',
      startRows: props.threeYStartRows,
      startLabel: props.threeYLabel,
      period: props.threeYPeriod,
      available: props.threeYAvailable,
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
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90 leading-relaxed">
          <strong className="font-medium">Total Change = end − start.</strong>{' '}
          The PDF report splits this into <em>Return</em> (mark-to-market) +{' '}
          <em>Flow</em> (net subscriptions) using Bloomberg total-return data
          per ISIN. Bloomberg returns are not yet synced to the dashboard, so
          the Return/Flow breakdown is not available here; the column shown is
          the un-split total (includes FX effect).
        </div>
        <ForeignChangesTable
          endRows={props.endRows}
          startRows={active.startRows}
          startLabel={active.startLabel}
          endLabel={props.endLabel}
        />
      </CardContent>
    </Card>
  );
}
