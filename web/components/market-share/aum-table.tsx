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
import { fmtPct, fmtUsdMM } from '@/lib/format';
import { type AumRow, pivotByAfp } from '@/lib/types-market-share';

const TIPO_COLS = ['A', 'B', 'C', 'D', 'E'] as const;
type View = 'usd' | 'clp' | 'share';

const VIEW_LABEL: Record<View, string> = {
  usd: 'USD MM',
  clp: 'CLP bn',
  share: 'Market Share',
};

export function AumTable({ rows }: { rows: AumRow[] }) {
  const [view, setView] = useState<View>('usd');
  const isShare = view === 'share';
  const valueKey = view === 'clp' ? 'aum_clp_bn' : 'aum_usd_mm';
  const unit = isShare ? '% of system AUM' : VIEW_LABEL[view];

  // Always pivot in USD MM — share is column-normalized off USD AUM.
  const pivoted = pivotByAfp(rows, valueKey);

  // Per-AFP total across A-E.
  const afpTotals = new Map<string, number>();
  for (const { afp, values } of pivoted) {
    let s = 0;
    for (const t of TIPO_COLS) s += Number(values[t]) || 0;
    afpTotals.set(afp, s);
  }
  // Per-tipo total across AFPs (excluding any 'TOTAL' afp row to avoid double-count).
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

  const fmtCell = (n: number | null, denom?: number | null) => {
    if (n == null) return '—';
    if (isShare) {
      if (!denom) return '—';
      return fmtPct(n / denom);
    }
    return fmtUsdMM(n);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {isShare ? 'Market Share by AFP × Fund Type' : 'AUM by AFP × Fund Type'} · {unit}
        </div>
        <SegmentedControl
          ariaLabel="AUM view"
          value={view}
          onChange={setView}
          options={(['usd', 'clp', 'share'] as View[]).map((v) => ({
            value: v,
            label: VIEW_LABEL[v],
          }))}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>AFP</TableHead>
            {TIPO_COLS.map((t) => (
              <TableHead key={t} className="text-right">
                Fund {t}
              </TableHead>
            ))}
            <TableHead className="text-right">TOTAL</TableHead>
            {!isShare && <TableHead className="text-right">Mkt Share</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pivoted
            .filter((p) => p.afp !== 'TOTAL')
            .sort(
              (a, b) =>
                (afpTotals.get(b.afp) ?? 0) - (afpTotals.get(a.afp) ?? 0),
            )
            .map(({ afp, values }) => (
              <TableRow key={afp}>
                <TableCell className="font-medium">{afp}</TableCell>
                {TIPO_COLS.map((t) => (
                  <TableCell key={t} className="text-right tabular-nums">
                    {fmtCell(
                      (values[t] as number | null | undefined) ?? null,
                      tipoTotals.get(t) ?? null,
                    )}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums font-medium">
                  {fmtCell(afpTotals.get(afp) ?? null, grandTotal || null)}
                </TableCell>
                {!isShare && (
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {grandTotal > 0
                      ? fmtPct((afpTotals.get(afp) ?? 0) / grandTotal)
                      : '—'}
                  </TableCell>
                )}
              </TableRow>
            ))}
          <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
            <TableCell>{isShare ? 'TOTAL' : 'SYSTEM'}</TableCell>
            {TIPO_COLS.map((t) => (
              <TableCell key={t} className="text-right tabular-nums">
                {isShare
                  ? (tipoTotals.get(t) ?? 0) > 0
                    ? '100.0%'
                    : '—'
                  : fmtCell(tipoTotals.get(t) ?? null)}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">
              {isShare ? '100.0%' : fmtCell(grandTotal)}
            </TableCell>
            {!isShare && (
              <TableCell className="text-right tabular-nums">100.0%</TableCell>
            )}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
