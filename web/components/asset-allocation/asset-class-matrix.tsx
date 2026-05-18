'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fmtPct, fmtUsdMM } from '@/lib/format';
import {
  AC_CATEGORIES,
  AC_OWUW_CATEGORIES,
  AC_SUBTOTALS,
  AFPS_AC,
  TIPO_FONDOS_AC,
  type AcCategory,
  type AssetClassByAfpRow,
  type AssetClassByTipoRow,
  pivotByCategory,
} from '@/lib/types-asset-allocation';
import { cn } from '@/lib/utils';

type Cut = 'afp' | 'tipo';
type Mode = 'usd' | 'pct';

const CUT_LABEL: Record<Cut, string> = {
  afp: 'By AFP',
  tipo: 'By Fund Type',
};
const MODE_LABEL: Record<Mode, string> = {
  usd: 'USD MM',
  pct: '% of AUM',
};

export function AssetClassMatrix({
  byAfp,
  byTipo,
}: {
  byAfp: AssetClassByAfpRow[];
  byTipo: AssetClassByTipoRow[];
}) {
  const [cut, setCut] = useState<Cut>('afp');
  const [mode, setMode] = useState<Mode>('usd');

  const cols = cut === 'afp' ? AFPS_AC : TIPO_FONDOS_AC;
  const colHeader = cut === 'afp' ? 'AFP' : 'Fund';

  // For "By AFP" the system column is the row that has afp='TOTAL' from the
  // SP view. For "By Fund Type" it's the tipo_fondo='TOTAL' row.
  const matrixUsd = useMemo(() => {
    if (cut === 'afp') {
      return pivotByCategory(byAfp, 'afp', 'monto_dolares');
    }
    return pivotByCategory(byTipo, 'tipo_fondo', 'monto_dolares');
  }, [cut, byAfp, byTipo]);

  const matrixPct = useMemo(() => {
    if (cut === 'afp') {
      return pivotByCategory(byAfp, 'afp', 'porcentaje');
    }
    return pivotByCategory(byTipo, 'tipo_fondo', 'porcentaje');
  }, [cut, byAfp, byTipo]);

  const matrix = mode === 'usd' ? matrixUsd : matrixPct;
  const fmt = (v: number | null | undefined) =>
    v == null
      ? '—'
      : mode === 'usd'
        ? fmtUsdMM(v)
        : fmtPct(v);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SegmentedControl
          ariaLabel="Cut"
          value={cut}
          onChange={setCut}
          options={(['afp', 'tipo'] as Cut[]).map((c) => ({
            value: c,
            label: CUT_LABEL[c],
          }))}
        />
        <SegmentedControl
          ariaLabel="Unit"
          value={mode}
          onChange={setMode}
          options={(['usd', 'pct'] as Mode[]).map((m) => ({
            value: m,
            label: MODE_LABEL[m],
          }))}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset Class</TableHead>
            {cols.map((c) => (
              <TableHead key={c} className="text-right">
                {cut === 'tipo' ? `Fund ${c}` : c}
              </TableHead>
            ))}
            <TableHead className="text-right">TOTAL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {AC_CATEGORIES.map((cat) => {
            const row = matrix.get(cat) ?? {};
            const isSubtotal = AC_SUBTOTALS.has(cat);
            return (
              <TableRow
                key={cat}
                className={cn(
                  isSubtotal && 'border-t font-medium bg-muted/30',
                  cat === 'Total Assets' && 'border-t-2 border-t-brand/60 bg-muted/40 font-semibold',
                )}
              >
                <TableCell className={cn('font-medium', isSubtotal && 'pl-3')}>
                  {cat}
                </TableCell>
                {cols.map((c) => (
                  <TableCell key={c} className="text-right tabular-nums">
                    {fmt(row[c])}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums font-medium">
                  {fmt(row['TOTAL'])}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {cut === 'afp' && (
        <OwUwHeatmap byAfp={byAfp} pctMatrix={matrixPct} />
      )}
    </div>
  );
}

function OwUwHeatmap({
  byAfp: _byAfp,
  pctMatrix,
}: {
  byAfp: AssetClassByAfpRow[];
  pctMatrix: Map<string, Record<string, number | null>>;
}) {
  // OW/UW = afp_pct - system_pct, computed on the % matrix per AFP for each
  // category. System pct lives in the 'TOTAL' column.
  const cells = useMemo(() => {
    const out = new Map<string, Record<string, number | null>>();
    for (const cat of AC_OWUW_CATEGORIES) {
      const row = pctMatrix.get(cat as AcCategory) ?? {};
      const sys = row['TOTAL'];
      const colVals: Record<string, number | null> = {};
      for (const afp of AFPS_AC) {
        const v = row[afp];
        colVals[afp] = v != null && sys != null ? v - sys : null;
      }
      out.set(cat, colVals);
    }
    return out;
  }, [pctMatrix]);

  // Color scale: ±5pp full saturation. Below that, scale opacity.
  function bg(v: number | null) {
    if (v == null || v === 0) return undefined;
    const mag = Math.min(Math.abs(v) / 0.05, 1); // 5 percentage points = full
    const alpha = (0.12 + 0.45 * mag).toFixed(2);
    return v > 0
      ? `rgba(16, 185, 129, ${alpha})` // emerald
      : `rgba(244, 63, 94, ${alpha})`; // rose
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Active bets vs system (OW / UW)
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset Class</TableHead>
            {AFPS_AC.map((afp) => (
              <TableHead key={afp} className="text-right">
                {afp}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {AC_OWUW_CATEGORIES.map((cat) => {
            const row = cells.get(cat) ?? {};
            return (
              <TableRow key={cat}>
                <TableCell className="font-medium">{cat}</TableCell>
                {AFPS_AC.map((afp) => {
                  const v = row[afp] ?? null;
                  return (
                    <TableCell
                      key={afp}
                      className="text-right tabular-nums"
                      style={{ backgroundColor: bg(v) }}
                    >
                      {v == null
                        ? '—'
                        : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-[11px] text-muted-foreground">
        OW / UW = AFP weight − system weight, expressed in percentage points.
      </p>
    </div>
  );
}
