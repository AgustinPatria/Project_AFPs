import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SourceBadge } from '@/components/source-badge';
import { cn } from '@/lib/utils';
import type { Sec08FlowRow } from '@/lib/types-sec08';

function fmtUsd(v: number): string {
  return Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function Sec08TopFlowsCard({ rows }: { rows: Sec08FlowRow[] }) {
  // Group by period_type then by direction
  const grouped: Record<string, Record<string, Sec08FlowRow[]>> = {};
  for (const r of rows) {
    grouped[r.period_type] ??= {};
    grouped[r.period_type][r.direction] ??= [];
    grouped[r.period_type][r.direction].push(r);
  }
  const periodTypes = Object.keys(grouped).sort();

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Top Net Inflows / Outflows — Foreign Funds</CardTitle>
        <SourceBadge dataset="sec06_08_transactions" />
      </CardHeader>
      <CardContent className="pt-0 space-y-6">
        {periodTypes.map((pt) => (
          <div key={pt}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              {pt === 'MTD' ? 'Monthly' : pt}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FlowSubtable
                rows={grouped[pt]['inflow'] ?? []}
                direction="inflow"
              />
              <FlowSubtable
                rows={grouped[pt]['outflow'] ?? []}
                direction="outflow"
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FlowSubtable({
  rows,
  direction,
}: {
  rows: Sec08FlowRow[];
  direction: 'inflow' | 'outflow';
}) {
  const Icon = direction === 'inflow' ? TrendingUp : TrendingDown;
  const tone =
    direction === 'inflow' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div>
      <div className={cn('flex items-center gap-1.5 text-xs font-semibold mb-1', tone)}>
        <Icon className="h-3.5 w-3.5" />
        Net {direction === 'inflow' ? 'Inflows' : 'Outflows'} (Top 10)
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30px]">#</TableHead>
            <TableHead>Fund</TableHead>
            <TableHead className="text-right w-[80px]">USD MM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.period_type}-${r.direction}-${r.rk}`}>
              <TableCell className="text-xs text-muted-foreground tabular-nums">{r.rk}</TableCell>
              <TableCell className="text-xs">{r.fondo}</TableCell>
              <TableCell className={cn('text-right tabular-nums text-xs', tone)}>
                {fmtUsd(r.amount_usd_mm)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
