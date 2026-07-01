'use client';

import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MultifondoRow, OverviewRow } from '@/lib/dimensions';
import { fmtPct, fmtUsdMM } from '@/lib/format';
import { cn } from '@/lib/utils';

// Column order mirrors the PDF Summary table: NAV | Uncalled | Alternatives |
// AUM | % AUM (alternatives share of the AFP's own AUM). % Share (share of
// system alternatives) is dashboard-only. Click an AFP row to expand its
// per-multifondo (A–E) breakdown.
export function OverviewTable({
  rows,
  detail = {},
}: {
  rows: OverviewRow[];
  detail?: Record<string, MultifondoRow[]>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (afp: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(afp)) next.delete(afp);
      else next.add(afp);
      return next;
    });

  const sys = rows.reduce(
    (acc, r) => ({
      aum: acc.aum + r.aum,
      nav: acc.nav + r.nav,
      uncalled: acc.uncalled + r.uncalled,
      total: acc.total + r.total,
    }),
    { aum: 0, nav: 0, uncalled: 0, total: 0 },
  );

  return (
    <Table>
      <TableCaption>
        Amounts in USD MM · % AUM = alternatives ÷ AFP AUM · % Share = ÷ system
        alternatives · click an AFP to break down by fund type (A–E)
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>AFP</TableHead>
          <TableHead className="text-right">NAV</TableHead>
          <TableHead className="text-right">Uncalled Cap.</TableHead>
          <TableHead className="text-right">Alternatives</TableHead>
          <TableHead className="text-right">AUM</TableHead>
          <TableHead className="text-right">% AUM</TableHead>
          <TableHead className="text-right">% Share</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const mfRows = detail[r.afp] ?? [];
          const isOpen = expanded.has(r.afp);
          const canExpand = mfRows.length > 0;
          return (
            <Fragment key={r.afp}>
              <TableRow
                className={cn(canExpand && 'cursor-pointer')}
                onClick={canExpand ? () => toggle(r.afp) : undefined}
                aria-expanded={canExpand ? isOpen : undefined}
              >
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {canExpand && (
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 text-muted-foreground transition-transform',
                          isOpen && 'rotate-90',
                        )}
                        aria-hidden
                      />
                    )}
                    {r.afp}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtUsdMM(r.nav)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtUsdMM(r.uncalled)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtUsdMM(r.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtUsdMM(r.aum)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.aum > 0 ? fmtPct(r.total / r.aum) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {sys.total > 0 ? fmtPct(r.total / sys.total) : '—'}
                </TableCell>
              </TableRow>
              {isOpen &&
                mfRows.map((m) => (
                  <TableRow
                    key={`${r.afp}-${m.multifondo}`}
                    className="bg-muted/20 text-muted-foreground hover:bg-muted/30"
                  >
                    <TableCell className="py-1.5 pl-9 text-xs font-medium">
                      Fund {m.multifondo}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-xs tabular-nums">
                      {fmtUsdMM(m.nav)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-xs tabular-nums">
                      {fmtUsdMM(m.uncalled)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-xs tabular-nums">
                      {fmtUsdMM(m.total)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-xs tabular-nums">
                      {fmtUsdMM(m.aum)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-xs tabular-nums">
                      {m.aum > 0 ? fmtPct(m.total / m.aum) : '—'}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-xs tabular-nums">
                      {sys.total > 0 ? fmtPct(m.total / sys.total) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
            </Fragment>
          );
        })}
        <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
          <TableCell>SYSTEM</TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtUsdMM(sys.nav)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtUsdMM(sys.uncalled)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtUsdMM(sys.total)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtUsdMM(sys.aum)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {sys.aum > 0 ? fmtPct(sys.total / sys.aum) : '—'}
          </TableCell>
          <TableCell className="text-right tabular-nums">100.0%</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
