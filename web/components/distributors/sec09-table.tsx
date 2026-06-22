'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { DistributorSec09Row } from '@/lib/types-distributors';

type Props = {
  rows: DistributorSec09Row[];
  fechas: { oneYearAgo: string; lastYearEnd: string; lastMonth: string; today: string };
};

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return `${String(d).padStart(2, '0')}-${MONTH_ABBR[m - 1]}-${String(y).slice(-2)}`;
}

function fmtUsd(v: number): string {
  if (v === 0) return '0';
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function DistributorsSec09Table({ rows, fechas }: Props) {
  // Accordion: each distributor row toggles its manager breakdown open/closed.
  // Starts fully collapsed — distributor totals are always visible.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  type ManagerSnapshots = Record<string, number>;
  type DistributorGroup = {
    distributor: string;
    managers: Map<string, ManagerSnapshots>;
    totals: ManagerSnapshots;
  };

  const { sortedGroups, grandTotals, cols } = useMemo(() => {
    const groups = new Map<string, DistributorGroup>();
    for (const r of rows) {
      let g = groups.get(r.distributor);
      if (!g) {
        g = { distributor: r.distributor, managers: new Map(), totals: {} };
        groups.set(r.distributor, g);
      }
      let m = g.managers.get(r.manager);
      if (!m) {
        m = {};
        g.managers.set(r.manager, m);
      }
      m[r.fecha_reporte] = (m[r.fecha_reporte] ?? 0) + r.monto_usd_mm;
      g.totals[r.fecha_reporte] = (g.totals[r.fecha_reporte] ?? 0) + r.monto_usd_mm;
    }

    // Sort distributors by latest-date total desc; Unmapped pinned last.
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      if (a.distributor === 'Unmapped') return 1;
      if (b.distributor === 'Unmapped') return -1;
      return (b.totals[fechas.today] ?? 0) - (a.totals[fechas.today] ?? 0);
    });

    const cols: { key: string; label: string; fecha: string }[] = [
      { key: 'oneYearAgo', label: '1 YEAR AGO', fecha: fechas.oneYearAgo },
      { key: 'lastYearEnd', label: 'LAST YEAR END', fecha: fechas.lastYearEnd },
      { key: 'lastMonth', label: 'LAST MONTH', fecha: fechas.lastMonth },
      { key: 'today', label: 'TODAY', fecha: fechas.today },
    ];

    const grandTotals: Record<string, number> = {};
    for (const g of sortedGroups) {
      for (const c of cols) {
        grandTotals[c.fecha] = (grandTotals[c.fecha] ?? 0) + (g.totals[c.fecha] ?? 0);
      }
    }
    return { sortedGroups, grandTotals, cols };
  }, [rows, fechas]);

  if (sortedGroups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin data para la fecha seleccionada.
      </p>
    );
  }

  function toggle(distributor: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(distributor)) next.delete(distributor);
      else next.add(distributor);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 py-3">
        <CardTitle className="text-base">Distributors &amp; Managers</CardTitle>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setExpanded(new Set(sortedGroups.map((g) => g.distributor)))
            }
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Expand all
          </button>
          <span className="text-[11px] text-muted-foreground">·</span>
          <button
            type="button"
            onClick={() => setExpanded(new Set())}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Collapse all
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Distributor / Manager</TableHead>
              {cols.map((c) => (
                <TableHead
                  key={c.key}
                  className="text-right text-[10px] uppercase tracking-wide"
                >
                  <div>{c.label}</div>
                  <div className="font-mono normal-case tracking-normal text-muted-foreground">
                    {fmtDate(c.fecha)}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedGroups.map((g) => {
              const isUnmapped = g.distributor === 'Unmapped';
              const isOpen = expanded.has(g.distributor);
              const sortedManagers = Array.from(g.managers.entries()).sort(
                (a, b) => (b[1][fechas.today] ?? 0) - (a[1][fechas.today] ?? 0),
              );
              return (
                <DistributorRows
                  key={g.distributor}
                  distributor={g.distributor}
                  isUnmapped={isUnmapped}
                  isOpen={isOpen}
                  totals={g.totals}
                  managers={sortedManagers}
                  cols={cols}
                  onToggle={() => toggle(g.distributor)}
                />
              );
            })}
            <TableRow className="border-t-2 font-semibold bg-muted/30">
              <TableCell>TOTAL</TableCell>
              {cols.map((c) => (
                <TableCell key={c.key} className="text-right tabular-nums">
                  {fmtUsd(grandTotals[c.fecha] ?? 0)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DistributorRows({
  distributor,
  isUnmapped,
  isOpen,
  totals,
  managers,
  cols,
  onToggle,
}: {
  distributor: string;
  isUnmapped: boolean;
  isOpen: boolean;
  totals: Record<string, number>;
  managers: [string, Record<string, number>][];
  cols: { key: string; label: string; fecha: string }[];
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer hover:bg-muted/50 transition-colors font-medium',
          isOpen && 'bg-muted/20',
          isUnmapped && 'bg-amber-500/5',
        )}
        onClick={onToggle}
        role="button"
        aria-expanded={isOpen}
      >
        <TableCell>
          <span className="inline-flex items-center gap-1.5">
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {distributor}
            {isUnmapped ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : null}
            <span className="text-[10px] text-muted-foreground font-normal">
              ({managers.length})
            </span>
          </span>
        </TableCell>
        {cols.map((c) => (
          <TableCell key={c.key} className="text-right tabular-nums">
            {fmtUsd(totals[c.fecha] ?? 0)}
          </TableCell>
        ))}
      </TableRow>
      {isOpen &&
        managers.map(([mgr, snaps]) => (
          <TableRow key={`${distributor}|${mgr}`} className="text-muted-foreground">
            <TableCell className="pl-10">{mgr}</TableCell>
            {cols.map((c) => (
              <TableCell key={c.key} className="text-right tabular-nums">
                {fmtUsd(snaps[c.fecha] ?? 0)}
              </TableCell>
            ))}
          </TableRow>
        ))}
    </>
  );
}
