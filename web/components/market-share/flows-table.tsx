'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fmtUsdMM } from '@/lib/format';
import {
  type CalendarYearFlows,
  type FlowsRow,
  pivotByAfp,
} from '@/lib/types-market-share';
import { cn } from '@/lib/utils';

const TIPO_COLS = ['A', 'B', 'C', 'D', 'E'] as const;

type Window = 'mom' | 'ytd' | 'ltm';
type Tab = Window | `cy-${number}`;

const WINDOW_LABEL: Record<Window, string> = {
  mom: 'Monthly',
  ytd: 'YTD',
  ltm: 'LTM',
};

export function FlowsTable({
  rows,
  calendarYears = [],
}: {
  rows: FlowsRow[];
  calendarYears?: CalendarYearFlows[];
}) {
  const [tab, setTab] = useState<Tab>('mom');
  const isCY = tab.startsWith('cy-');
  const activeRows = isCY
    ? calendarYears.find((c) => `cy-${c.year}` === tab)?.rows ?? []
    : rows;
  // For calendar years the CY net flow = flow_ytd at Dec-31 of that year.
  const valueKey = (isCY
    ? `flow_ytd_usd_mm`
    : `flow_${tab}_usd_mm`) as keyof FlowsRow;

  const pivoted = pivotByAfp(activeRows, valueKey);
  const tabLabel = isCY ? tab.slice(3) : WINDOW_LABEL[tab as Window];

  // TOTAL across A-E per AFP.
  const afpTotals = new Map<string, number>();
  for (const { afp, values } of pivoted) {
    let s = 0;
    for (const t of TIPO_COLS) s += Number(values[t]) || 0;
    afpTotals.set(afp, s);
  }
  // TOTAL per tipo across AFPs.
  const tipoTotals = new Map<string, number>();
  for (const t of TIPO_COLS) {
    let s = 0;
    for (const { afp, values } of pivoted) {
      if (afp === 'TOTAL') continue;
      s += Number(values[t]) || 0;
    }
    tipoTotals.set(t, s);
  }
  const grandTotal = TIPO_COLS.reduce((s, t) => s + (tipoTotals.get(t) ?? 0), 0);

  function fmtFlow(n: number | null | undefined) {
    if (n == null) return '—';
    const sign = n < 0 ? '-' : '';
    return `${sign}${fmtUsdMM(Math.abs(n))}`;
  }

  function cellTone(v: number | null | undefined) {
    if (v == null || v === 0) return 'text-muted-foreground';
    return v < 0 ? 'text-red-400' : 'text-emerald-400';
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          Net Flows by AFP × Fund Type · {tabLabel} · USD MM
        </div>
        <SegmentedControl<Tab>
          ariaLabel="Flows window"
          value={tab}
          onChange={setTab}
          options={[
            ...(['mom', 'ytd', 'ltm'] as Window[]).map((w) => ({
              value: w as Tab,
              label: WINDOW_LABEL[w],
            })),
            ...calendarYears.map((c) => ({
              value: `cy-${c.year}` as Tab,
              label: String(c.year),
            })),
          ]}
        />
      </div>
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[16%]" />
          {TIPO_COLS.map((t) => (
            <col key={t} className="w-[14%]" />
          ))}
          <col className="w-[14%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>AFP</TableHead>
            {TIPO_COLS.map((t) => (
              <TableHead key={t} className="text-right">
                Fund {t}
              </TableHead>
            ))}
            <TableHead className="text-right">TOTAL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pivoted
            .filter((p) => p.afp !== 'TOTAL')
            .map(({ afp, values }) => (
              <TableRow key={afp}>
                <TableCell className="font-medium">{afp}</TableCell>
                {TIPO_COLS.map((t) => {
                  const v = values[t] as number | null | undefined;
                  return (
                    <TableCell
                      key={t}
                      className={cn(
                        'text-right tabular-nums',
                        cellTone(v),
                      )}
                    >
                      {fmtFlow(v)}
                    </TableCell>
                  );
                })}
                <TableCell
                  className={cn(
                    'text-right tabular-nums font-medium',
                    cellTone(afpTotals.get(afp)),
                  )}
                >
                  {fmtFlow(afpTotals.get(afp) ?? null)}
                </TableCell>
              </TableRow>
            ))}
          <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
            <TableCell>SYSTEM</TableCell>
            {TIPO_COLS.map((t) => (
              <TableCell
                key={t}
                className={cn(
                  'text-right tabular-nums',
                  cellTone(tipoTotals.get(t)),
                )}
              >
                {fmtFlow(tipoTotals.get(t) ?? null)}
              </TableCell>
            ))}
            <TableCell
              className={cn(
                'text-right tabular-nums',
                cellTone(grandTotal),
              )}
            >
              {fmtFlow(grandTotal)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
