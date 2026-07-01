import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Sec05SizeRow } from '@/lib/types-sec05';
import type { Sec05ResolvedFechas } from '@/lib/queries-sec05';

function fmtPct(v: number): string {
  if (v === 0) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonYY(fecha: string | null): string {
  if (!fecha) return 'no data';
  const [y, m] = fecha.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

export function Sec05SizeCard({
  rows,
  fechas,
  targetFecha,
}: {
  rows: Sec05SizeRow[];
  fechas: Sec05ResolvedFechas;
  targetFecha: string;
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      pionero: acc.pionero + r.pionero_pct,
      mrv: acc.mrv + r.mrv_pct,
      ipsa: acc.ipsa + r.ipsa_pct,
      afps: acc.afps + r.afps_pct,
    }),
    { pionero: 0, mrv: 0, ipsa: 0, afps: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portfolio breakdown by size</CardTitle>
        <div className="text-[10px] text-muted-foreground mt-1">
          Size = S&amp;P IGPA Large / Mid / Small membership · each column
          resolved to closest available date ≤ {fmtMonYY(targetFecha)}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">Size</TableHead>
              <ColHeader title="PIONERO" fecha={fechas.pionero} />
              <ColHeader title="MRV" fecha={fechas.mrv} />
              <ColHeader title="IPSA" fecha={fechas.ipsa} />
              <ColHeader title="AFPs" fecha={fechas.afps} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.bucket}>
                <TableCell className="font-medium">{r.bucket}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPct(r.pionero_pct)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPct(r.mrv_pct)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPct(r.ipsa_pct)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPct(r.afps_pct)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-semibold bg-muted/30">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(totals.pionero)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(totals.mrv)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(totals.ipsa)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(totals.afps)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p className="text-[10px] text-muted-foreground mt-2">
          &quot;No IGPA&quot; = stocks outside the S&amp;P IGPA universe (off-index
          small caps, foreign listings). Index membership from
          TBL_BMS_Exposicion (S&amp;P), daily since Mar-2025.
        </p>
      </CardContent>
    </Card>
  );
}

function ColHeader({ title, fecha }: { title: string; fecha: string | null }) {
  return (
    <TableHead className="text-right">
      <div className="flex items-center justify-end gap-1.5">{title}</div>
      <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
        {fmtMonYY(fecha)}
      </div>
    </TableHead>
  );
}
