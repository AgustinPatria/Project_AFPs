'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { LocalEquityPoint } from '@/lib/queries-strategy';
import { cn } from '@/lib/utils';

const DIRECT_COLOR = 'oklch(0.75 0.16 200)'; // teal
const FUNDS_COLOR = 'oklch(0.65 0.18 30)';   // orange

function fmtMonth(fecha: string): string {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m] = fecha.split('-');
  return `${monthNames[Number(m) - 1]}-${y.slice(2)}`;
}

function fmtCLPBn(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

type Mode = 'clp' | 'pct';

export function LocalEquityAreaChart({ history }: { history: LocalEquityPoint[] }) {
  const [mode, setMode] = useState<Mode>('clp');

  const data = history.map((p) => ({
    fecha: fmtMonth(p.fecha_reporte),
    Direct:
      mode === 'clp' ? p.direct_clp_bn : (p.direct_clp_bn / p.total_clp_bn) * 100,
    Funds:
      mode === 'clp' ? p.funds_clp_bn : (p.funds_clp_bn / p.total_clp_bn) * 100,
  }));

  return (
    <>
      <div className="flex justify-end mb-2">
        <SegmentedControl
          ariaLabel="Unit"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'clp' as const, label: 'CLP bn' },
            { value: 'pct' as const, label: '%' },
          ]}
        />
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickMargin={6} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => (mode === 'clp' ? fmtCLPBn(v) : `${v.toFixed(0)}%`)}
              width={56}
              domain={mode === 'pct' ? [0, 100] : undefined}
              ticks={mode === 'pct' ? [0, 20, 40, 60, 80, 100] : undefined}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-[11px] shadow-sm space-y-0.5">
                    <div className="font-medium border-b border-border/40 pb-1 mb-1">{label}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-baseline gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-sm"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="flex-1">{String(p.dataKey)}</span>
                        <span className="tabular-nums">
                          {mode === 'clp'
                            ? `${(Number(p.value) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} CLP bn`
                            : fmtPct(Number(p.value) || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
            <Area
              type="monotone"
              dataKey="Direct"
              stackId="1"
              stroke={DIRECT_COLOR}
              fill={DIRECT_COLOR}
              fillOpacity={0.7}
            />
            <Area
              type="monotone"
              dataKey="Funds"
              stackId="1"
              stroke={FUNDS_COLOR}
              fill={FUNDS_COLOR}
              fillOpacity={0.7}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function LocalEquityTable({ rows }: { rows: LocalEquityPoint[] }) {
  const [mode, setMode] = useState<Mode>('clp');
  return (
    <>
      <div className="flex justify-end mb-2">
        <SegmentedControl
          ariaLabel="Unit"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'clp' as const, label: 'CLP bn' },
            { value: 'pct' as const, label: '%' },
          ]}
        />
      </div>
      <table className="w-full text-xs">
        <thead className="border-b border-border">
          <tr>
            <th className="text-left py-2 font-medium text-muted-foreground">
              Local Equity {mode === 'clp' ? '(CLP bn)' : '(%)'}
            </th>
            {rows.map((r) => (
              <th
                key={r.fecha_reporte}
                className="text-right py-2 font-medium text-muted-foreground"
              >
                {fmtMonth(r.fecha_reporte)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/40">
            <td className="py-1.5">Direct Investment</td>
            {rows.map((r) => (
              <td key={r.fecha_reporte} className="text-right py-1.5 tabular-nums">
                {mode === 'clp'
                  ? r.direct_clp_bn.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : fmtPct((r.direct_clp_bn / r.total_clp_bn) * 100)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-border/40">
            <td className="py-1.5">Investment Funds</td>
            {rows.map((r) => (
              <td key={r.fecha_reporte} className="text-right py-1.5 tabular-nums">
                {mode === 'clp'
                  ? r.funds_clp_bn.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : fmtPct((r.funds_clp_bn / r.total_clp_bn) * 100)}
              </td>
            ))}
          </tr>
          <tr className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
            <td className="py-1.5">TOTAL</td>
            {rows.map((r) => (
              <td key={r.fecha_reporte} className="text-right py-1.5 tabular-nums">
                {mode === 'clp'
                  ? r.total_clp_bn.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : '100.0%'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </>
  );
}
