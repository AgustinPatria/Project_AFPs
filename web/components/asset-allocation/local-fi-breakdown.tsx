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
  AFPS_AC,
  LOCAL_FI_BUCKETS,
  type LocalFiRow,
} from '@/lib/types-asset-allocation';
import { cn } from '@/lib/utils';

type Mode = 'usd' | 'pct';

const MODE_LABEL: Record<Mode, string> = {
  usd: 'USD MM',
  pct: '% of Total AUM',
};

export function LocalFiBreakdown({
  rows,
  totalAssetsByAfp,
}: {
  rows: LocalFiRow[];
  // Per-AFP Total Assets (USD MM) — denominator for the "% of Total AUM" view.
  // Includes 'TOTAL' key for system-wide.
  totalAssetsByAfp: Record<string, number>;
}) {
  const [mode, setMode] = useState<Mode>('usd');

  const fechaReporte = rows[0]?.fecha_reporte ?? null;

  // pivot[bucket][afp] = usd_mm; bucket['TOTAL'] = sum across AFPs.
  const matrix = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const b of LOCAL_FI_BUCKETS) m.set(b, {});
    for (const r of rows) {
      if (!m.has(r.pdf_bucket)) m.set(r.pdf_bucket, {});
      const cur = m.get(r.pdf_bucket)!;
      cur[r.afp] = (cur[r.afp] ?? 0) + r.monto_usd_mm;
    }
    // System TOTAL across AFPs per bucket.
    for (const [, cells] of m) {
      let s = 0;
      for (const afp of AFPS_AC) s += cells[afp] ?? 0;
      cells['TOTAL'] = s;
    }
    return m;
  }, [rows]);

  // Per-AFP Local FI subtotals (used for the bottom "Total Local Fixed Income" row).
  const afpLocalFiTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const afp of AFPS_AC) {
      let s = 0;
      for (const b of LOCAL_FI_BUCKETS) {
        s += matrix.get(b)?.[afp] ?? 0;
      }
      out[afp] = s;
    }
    out['TOTAL'] = AFPS_AC.reduce((s, afp) => s + (out[afp] ?? 0), 0);
    return out;
  }, [matrix]);

  const fmt = (n: number, denom: number) => {
    if (n == null) return '—';
    if (mode === 'pct') {
      if (!denom) return '—';
      return fmtPct(n / denom);
    }
    return fmtUsdMM(n);
  };

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No CHIST data loaded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-muted-foreground">
          Issuer-type breakdown of Local Fixed Income · {MODE_LABEL[mode]}
        </div>
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
            <TableHead>Issuer Type</TableHead>
            {AFPS_AC.map((afp) => (
              <TableHead key={afp} className="text-right">
                {afp}
              </TableHead>
            ))}
            <TableHead className="text-right">TOTAL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {LOCAL_FI_BUCKETS.map((bucket) => {
            const cells = matrix.get(bucket) ?? {};
            return (
              <TableRow key={bucket}>
                <TableCell className="font-medium">{bucket}</TableCell>
                {AFPS_AC.map((afp) => (
                  <TableCell key={afp} className="text-right tabular-nums">
                    {fmt(cells[afp] ?? 0, totalAssetsByAfp[afp] ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums font-medium">
                  {fmt(cells['TOTAL'] ?? 0, totalAssetsByAfp['TOTAL'] ?? 0)}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
            <TableCell>Total Local Fixed Income</TableCell>
            {AFPS_AC.map((afp) => (
              <TableCell key={afp} className="text-right tabular-nums">
                {fmt(afpLocalFiTotals[afp] ?? 0, totalAssetsByAfp[afp] ?? 0)}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">
              {fmt(afpLocalFiTotals['TOTAL'] ?? 0, totalAssetsByAfp['TOTAL'] ?? 0)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <LocalFiOwUw
        matrix={matrix}
        afpLocalFiTotals={afpLocalFiTotals}
        totalAssetsByAfp={totalAssetsByAfp}
      />

      {fechaReporte && (
        <p className="text-[11px] text-muted-foreground italic">
          * Local FI breakdown · valuation date {fechaReporte}.
        </p>
      )}
    </div>
  );
}

function LocalFiOwUw({
  matrix,
  afpLocalFiTotals,
  totalAssetsByAfp,
}: {
  matrix: Map<string, Record<string, number>>;
  afpLocalFiTotals: Record<string, number>;
  totalAssetsByAfp: Record<string, number>;
}) {
  // Per-AFP per-bucket OW/UW = (bucket / AFP_total_aum) - (system_bucket / system_total_aum).
  // Compute on the underlying values to avoid rounding artifacts.
  const cells = useMemo(() => {
    const out = new Map<string, Record<string, number | null>>();
    const sysAum = totalAssetsByAfp['TOTAL'] || 0;
    for (const bucket of LOCAL_FI_BUCKETS) {
      const row = matrix.get(bucket) ?? {};
      const sysPct = sysAum > 0 ? (row['TOTAL'] ?? 0) / sysAum : 0;
      const colVals: Record<string, number | null> = {};
      for (const afp of AFPS_AC) {
        const aum = totalAssetsByAfp[afp] ?? 0;
        if (!aum) {
          colVals[afp] = null;
          continue;
        }
        colVals[afp] = (row[afp] ?? 0) / aum - sysPct;
      }
      out.set(bucket, colVals);
    }
    // Total Local FI row: same formula on the column sum.
    const sysTotalPct =
      sysAum > 0 ? (afpLocalFiTotals['TOTAL'] ?? 0) / sysAum : 0;
    const totalRow: Record<string, number | null> = {};
    for (const afp of AFPS_AC) {
      const aum = totalAssetsByAfp[afp] ?? 0;
      if (!aum) {
        totalRow[afp] = null;
        continue;
      }
      totalRow[afp] = (afpLocalFiTotals[afp] ?? 0) / aum - sysTotalPct;
    }
    out.set('Total Local Fixed Income', totalRow);
    return out;
  }, [matrix, afpLocalFiTotals, totalAssetsByAfp]);

  function bg(v: number | null) {
    if (v == null || v === 0) return undefined;
    const mag = Math.min(Math.abs(v) / 0.05, 1); // 5pp = full saturation
    const alpha = (0.12 + 0.45 * mag).toFixed(2);
    return v > 0
      ? `rgba(16, 185, 129, ${alpha})`
      : `rgba(244, 63, 94, ${alpha})`;
  }

  function fmtSigned(v: number | null) {
    if (v == null) return '—';
    return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        OW / UW vs System
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Issuer Type</TableHead>
            {AFPS_AC.map((afp) => (
              <TableHead key={afp} className="text-right">
                {afp}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {LOCAL_FI_BUCKETS.map((bucket) => {
            const row = cells.get(bucket) ?? {};
            return (
              <TableRow key={bucket}>
                <TableCell className="font-medium">{bucket}</TableCell>
                {AFPS_AC.map((afp) => {
                  const v = row[afp] ?? null;
                  return (
                    <TableCell
                      key={afp}
                      className="text-right tabular-nums"
                      style={{ backgroundColor: bg(v) }}
                    >
                      {fmtSigned(v)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
            <TableCell>Total Local Fixed Income</TableCell>
            {AFPS_AC.map((afp) => {
              const v = cells.get('Total Local Fixed Income')?.[afp] ?? null;
              return (
                <TableCell
                  key={afp}
                  className="text-right tabular-nums"
                  style={{ backgroundColor: bg(v) }}
                >
                  {fmtSigned(v)}
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
