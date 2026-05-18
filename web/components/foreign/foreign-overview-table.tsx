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
import { fmtPct, fmtUsdMM } from '@/lib/format';
import {
  buildPdfTree,
  type DisplayRow,
  type ForeignSummaryRow,
} from '@/lib/types-foreign';
import { cn } from '@/lib/utils';

export function ForeignOverviewTable({ rows }: { rows: ForeignSummaryRow[] }) {
  // Set of row keys that are *collapsed*. Empty by default = all expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree: DisplayRow[] = useMemo(() => buildPdfTree(rows), [rows]);

  // Pre-compute structural info: parent chain + has-children for each row.
  const { parentsByKey, hasChildrenByKey } = useMemo(() => {
    const parents = new Map<string, string[]>();
    const hasChildren = new Map<string, boolean>();
    const stack: DisplayRow[] = [];
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

  // Visible rows: skip any row whose ancestor chain contains a collapsed key.
  const visible = tree.filter((row) => {
    const ancestors = parentsByKey.get(row.key) ?? [];
    return !ancestors.some((a) => collapsed.has(a));
  });

  function fmtUsd(r: DisplayRow): string {
    return fmtUsdMM(r.usd);
  }
  function fmtForeign(r: DisplayRow): string {
    return r.usd === 0 ? '—' : fmtPct(r.pct_foreign);
  }
  function fmtAssetClass(r: DisplayRow): string {
    if (r.pct_asset_class == null) return '—';
    return r.usd === 0 ? '—' : fmtPct(r.pct_asset_class);
  }

  // Visual classes per row level / subtotal.
  function rowClass(r: DisplayRow): string {
    if (r.key === 'grand-total') {
      return 'border-t-2 border-t-brand/60 bg-muted/40 font-semibold';
    }
    if (r.key === 'fi-total' || r.key === 'eq-total') {
      return 'border-t font-semibold bg-muted/30';
    }
    if (r.level === 0) {
      return 'border-t font-semibold bg-muted/20';
    }
    if (r.level === 1) {
      return 'font-medium';
    }
    if (r.level === 2) {
      return r.isSubtotal ? 'font-medium text-foreground' : '';
    }
    return 'text-muted-foreground';
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-muted-foreground">
          Foreign investment by PDF bucket × region × category
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bucket / Region / Category</TableHead>
            <TableHead className="text-right">USD MM</TableHead>
            <TableHead className="text-right">% Foreign Investment</TableHead>
            <TableHead className="text-right">% Asset Class</TableHead>
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
                  {fmtUsd(r)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtForeign(r)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtAssetClass(r)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
