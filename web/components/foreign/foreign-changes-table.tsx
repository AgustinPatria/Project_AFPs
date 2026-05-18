'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtUsdMM } from '@/lib/format';
import {
  buildPdfTree,
  type DisplayRow,
  type ForeignSummaryRow,
} from '@/lib/types-foreign';
import { cn } from '@/lib/utils';

type Props = {
  endRows: ForeignSummaryRow[];
  startRows: ForeignSummaryRow[];
  startLabel: string; // e.g. "Dec-25 USD mm"
  endLabel: string;   // e.g. "Mar-26 USD mm"
};

type ChangeRow = DisplayRow & {
  start: number;
  end: number;
  change: number;
};

export function ForeignChangesTable({
  endRows,
  startRows,
  startLabel,
  endLabel,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree: ChangeRow[] = useMemo(() => {
    // Union tree gives us every key present in either fecha; lookups attach
    // the per-fecha USD totals.
    const base = buildPdfTree([...endRows, ...startRows]);
    const startByKey = new Map(
      buildPdfTree(startRows).map((r) => [r.key, r.usd]),
    );
    const endByKey = new Map(
      buildPdfTree(endRows).map((r) => [r.key, r.usd]),
    );
    return base.map((r) => {
      const start = startByKey.get(r.key) ?? 0;
      const end = endByKey.get(r.key) ?? 0;
      return { ...r, start, end, change: end - start };
    });
  }, [endRows, startRows]);

  const { parentsByKey, hasChildrenByKey } = useMemo(() => {
    const parents = new Map<string, string[]>();
    const hasChildren = new Map<string, boolean>();
    const stack: ChangeRow[] = [];
    for (const row of tree) {
      while (stack.length > 0 && stack[stack.length - 1].level >= row.level) {
        stack.pop();
      }
      parents.set(row.key, stack.map((s) => s.key));
      for (const ancestor of stack) {
        hasChildren.set(ancestor.key, true);
      }
      hasChildren.set(row.key, hasChildren.get(row.key) ?? false);
      stack.push(row);
    }
    return { parentsByKey: parents, hasChildrenByKey: hasChildren };
  }, [tree]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visible = tree.filter((row) => {
    const ancestors = parentsByKey.get(row.key) ?? [];
    return !ancestors.some((a) => collapsed.has(a));
  });

  function rowClass(r: ChangeRow): string {
    if (r.key === 'grand-total')
      return 'border-t-2 border-t-brand/60 bg-muted/40 font-semibold';
    if (r.key === 'fi-total' || r.key === 'eq-total')
      return 'border-t font-semibold bg-muted/30';
    if (r.level === 0) return 'border-t font-semibold bg-muted/20';
    if (r.level === 1) return 'font-medium';
    if (r.level === 2) return r.isSubtotal ? 'font-medium text-foreground' : '';
    return 'text-muted-foreground';
  }

  function fmtChange(v: number): string {
    if (Math.round(v) === 0) return '—';
    const sign = v > 0 ? '+' : '';
    return sign + fmtUsdMM(v);
  }

  function changeClass(v: number): string {
    if (Math.round(v) === 0) return 'text-muted-foreground';
    if (v > 0) return 'text-emerald-600 dark:text-emerald-400';
    return 'text-red-600 dark:text-red-400';
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(new Set())}
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Expand all
        </button>
        <span className="text-[11px] text-muted-foreground">·</span>
        <button
          type="button"
          onClick={() => {
            const all = new Set<string>();
            for (const r of tree) {
              if (hasChildrenByKey.get(r.key)) all.add(r.key);
            }
            setCollapsed(all);
          }}
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Collapse all
        </button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bucket / Region / Category</TableHead>
            <TableHead className="text-right">{startLabel}</TableHead>
            <TableHead className="text-right">Total Change</TableHead>
            <TableHead className="text-right">{endLabel}</TableHead>
          </TableRow>
        </TableHeader>
      <TableBody>
        {visible.map((r) => {
          const isParent = !!hasChildrenByKey.get(r.key);
          const isCollapsed = collapsed.has(r.key);
          return (
            <TableRow
              key={r.key}
              className={cn(
                rowClass(r),
                isParent &&
                  'cursor-pointer hover:bg-muted/50 transition-colors',
              )}
              onClick={isParent ? () => toggle(r.key) : undefined}
              role={isParent ? 'button' : undefined}
              aria-expanded={isParent ? !isCollapsed : undefined}
            >
              <TableCell
                style={{ paddingLeft: `${0.5 + r.level * 1.25}rem` }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {isParent ? (
                    isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )
                  ) : (
                    <span className="inline-block w-3.5" />
                  )}
                  {r.label}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.start === 0 ? '—' : fmtUsdMM(r.start)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  changeClass(r.change),
                )}
              >
                {fmtChange(r.change)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.end === 0 ? '—' : fmtUsdMM(r.end)}
              </TableCell>
            </TableRow>
          );
        })}
        </TableBody>
      </Table>
    </div>
  );
}
