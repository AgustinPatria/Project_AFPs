import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtUsdMM } from '@/lib/format';
import type { StrategyAfpOwUwRow } from '@/lib/queries-strategy';

// Weight figures here are ~1% of an AFP's book and OW/UW deltas are fractions of a
// percentage point, so the heatmap is scaled to the largest |OW/UW| in the data
// rather than a fixed band — otherwise every cell would render near-colorless.
function cellBg(v: number, maxAbs: number): string | undefined {
  if (!v || maxAbs <= 0) return undefined;
  const mag = Math.min(Math.abs(v) / maxAbs, 1);
  const alpha = (0.12 + 0.45 * mag).toFixed(2);
  return v > 0
    ? `rgba(16, 185, 129, ${alpha})` // emerald = overweight
    : `rgba(244, 63, 94, ${alpha})`; // rose = underweight
}

const fmtPp = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}pp`;
const fmtWeight = (v: number) => `${(v * 100).toFixed(2)}%`;

export function StrategyAfpOwUwTable({
  rows,
  fecha,
}: {
  rows: StrategyAfpOwUwRow[];
  fecha: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No CHIST holdings for this family.
      </p>
    );
  }
  const sysAvg = rows[0].sys_avg;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.ow_uw)), 1e-9);

  return (
    <div className="space-y-2">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[24%]" />
          <col className="w-[24%]" />
          <col className="w-[24%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>AFP</TableHead>
            <TableHead className="text-right">Held (USD MM)</TableHead>
            <TableHead className="text-right">Weight in book</TableHead>
            <TableHead className="text-right">OW / UW vs system</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.afp}>
              <TableCell className="font-medium">{r.afp}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtUsdMM(r.our_usd_mm)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtWeight(r.weight)}
              </TableCell>
              <TableCell
                className="text-right tabular-nums"
                style={{ backgroundColor: cellBg(r.ow_uw, maxAbs) }}
              >
                {fmtPp(r.ow_uw)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-[11px] text-muted-foreground">
        OW / UW = AFP weight − system weight ({fmtWeight(sysAvg)}), in percentage
        points. Weight = AFP&apos;s holding in this family&apos;s Moneda funds ÷ its
        total AUM. Holdings from CHIST cartera (lagged) · {fecha}.
      </p>
    </div>
  );
}
