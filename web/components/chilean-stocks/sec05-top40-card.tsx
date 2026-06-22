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
import type { Sec05Top40Row } from '@/lib/types-sec05';

const CUARTIL_TONE: Record<string, string> = {
  '1': 'bg-emerald-500/15 text-emerald-400',
  '2': 'bg-sky-500/15 text-sky-400',
  '3': 'bg-amber-500/15 text-amber-400',
  '4': 'bg-orange-500/15 text-orange-400',
  Other: 'bg-muted text-muted-foreground',
};

export function Sec05Top40Card({ rows }: { rows: Sec05Top40Row[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Top 40 Chilean Companies — AFPs</CardTitle>
        <SourceBadge dataset="sec01_market_share" />
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">#</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>GICS</TableHead>
              <TableHead className="w-[80px]">Cuartil</TableHead>
              <TableHead className="text-right">USD MM</TableHead>
              <TableHead className="text-right w-[80px]">Weight</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.rk}-${r.nemo}`}>
                <TableCell className="text-xs text-muted-foreground tabular-nums">{r.rk}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.company_name ?? r.emisor ?? r.nemo}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{r.nemo}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.gics_name ?? r.gics_chist ?? '—'}
                </TableCell>
                <TableCell>
                  {r.cuartil ? (
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono uppercase rounded',
                        CUARTIL_TONE[r.cuartil],
                      )}
                    >
                      {r.cuartil === 'Other' ? 'Other' : `Q${r.cuartil}`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.monto_usd_mm.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(r.weight * 100).toFixed(2)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
