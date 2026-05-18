import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OverviewRow } from '@/lib/dimensions';
import { fmtPct, fmtUsdMM } from '@/lib/format';

export function OverviewTable({ rows }: { rows: OverviewRow[] }) {
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
      <TableHeader>
        <TableRow>
          <TableHead>AFP</TableHead>
          <TableHead className="text-right">AUM</TableHead>
          <TableHead className="text-right">NAV</TableHead>
          <TableHead className="text-right">Uncalled</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">% Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.afp}>
            <TableCell className="font-medium">{r.afp}</TableCell>
            <TableCell className="text-right tabular-nums">
              {fmtUsdMM(r.aum)}
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
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {sys.total > 0 ? fmtPct(r.total / sys.total) : '—'}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
          <TableCell>SYSTEM</TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtUsdMM(sys.aum)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtUsdMM(sys.nav)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtUsdMM(sys.uncalled)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {fmtUsdMM(sys.total)}
          </TableCell>
          <TableCell className="text-right tabular-nums">100.0%</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
