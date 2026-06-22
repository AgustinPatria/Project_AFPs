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
import type { Sec05ConcentrationRow } from '@/lib/types-sec05';
import type { Sec05ResolvedFechas } from '@/lib/queries-sec05';

const ROW_LABELS: Record<Sec05ConcentrationRow['metric'], string> = {
  companies: '# companies',
  top10: 'Top 10',
  top20: 'Top 20',
  top30: 'Top 30',
};

function fmtCell(metric: Sec05ConcentrationRow['metric'], v: number): string {
  if (v === 0) return '—';
  if (metric === 'companies') return Math.round(v).toString();
  return `${(v * 100).toFixed(1)}%`;
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonYY(fecha: string | null): string {
  if (!fecha) return 'no data';
  const [y, m] = fecha.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

export function Sec05ConcentrationCard({
  rows,
  fechas,
}: {
  rows: Sec05ConcentrationRow[];
  fechas: Sec05ResolvedFechas;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Concentration</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">Metric</TableHead>
              <ColHeader title="PIONERO" fecha={fechas.pionero} dataset="sec05_pionero_benchmark" />
              <ColHeader title="MRV" fecha={fechas.mrv} dataset="sec05_mrv_benchmark" />
              <ColHeader title="IPSA" fecha={fechas.ipsa} dataset="sec05_ipsa_composition" />
              <ColHeader title="AFPs" fecha={fechas.afps} dataset="sec01_market_share" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.metric}>
                <TableCell className="font-medium">{ROW_LABELS[r.metric]}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtCell(r.metric, r.pionero)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtCell(r.metric, r.mrv)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtCell(r.metric, r.ipsa)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtCell(r.metric, r.afps)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ColHeader({ title, fecha, dataset }: { title: string; fecha: string | null; dataset: string }) {
  return (
    <TableHead className="text-right">
      <div className="flex items-center justify-end gap-1.5">
        {title}
        <SourceBadge dataset={dataset} />
      </div>
      <div className="text-[9px] font-mono text-muted-foreground mt-0.5">{fmtMonYY(fecha)}</div>
    </TableHead>
  );
}
