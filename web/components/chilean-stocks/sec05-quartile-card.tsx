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
import type { Sec05QuartileRow } from '@/lib/types-sec05';
import type { Sec05ResolvedFechas } from '@/lib/queries-sec05';

function fmtPct(v: number): string {
  if (v === 0) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function cuartilLabel(c: Sec05QuartileRow['cuartil']): string {
  return c === 'Other' ? 'Other' : `Q${c}`;
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonYY(fecha: string | null): string {
  if (!fecha) return 'no data';
  const [y, m] = fecha.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

export function Sec05QuartileCard({
  rows,
  fechas,
  targetFecha,
}: {
  rows: Sec05QuartileRow[];
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
        <CardTitle className="text-base">Portfolio breakdown by quartile</CardTitle>
        <div className="text-[10px] text-muted-foreground mt-1">
          Each column resolved to closest available date ≤ {fmtMonYY(targetFecha)}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">Quartile</TableHead>
              <ColHeader
                title="PIONERO"
                fecha={fechas.pionero}
                dataset="sec05_pionero_benchmark"
              />
              <ColHeader
                title="MRV"
                fecha={fechas.mrv}
                dataset="sec05_mrv_benchmark"
              />
              <ColHeader
                title="IPSA"
                fecha={fechas.ipsa}
                dataset="sec05_ipsa_composition"
              />
              <ColHeader
                title="AFPs"
                fecha={fechas.afps}
                dataset="sec01_market_share"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.cuartil}>
                <TableCell className="font-medium">{cuartilLabel(r.cuartil)}</TableCell>
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
      </CardContent>
    </Card>
  );
}

function ColHeader({
  title,
  fecha,
  dataset,
}: {
  title: string;
  fecha: string | null;
  dataset: string;
}) {
  return (
    <TableHead className="text-right">
      <div className="flex items-center justify-end gap-1.5">
        {title}
        <SourceBadge dataset={dataset} />
      </div>
      <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
        {fmtMonYY(fecha)}
      </div>
    </TableHead>
  );
}
