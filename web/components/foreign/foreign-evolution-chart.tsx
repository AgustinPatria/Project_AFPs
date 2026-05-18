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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fmtUsdMM } from '@/lib/format';
import type { ForeignEvolutionPoint } from '@/lib/queries-foreign';
import { cn } from '@/lib/utils';

type Mode = 'usd' | 'pct';

const SERIES = [
  { key: 'equity', label: 'Equity', color: 'oklch(0.65 0.18 250)' },
  { key: 'fixed_income', label: 'Fixed Income', color: 'oklch(0.65 0.18 30)' },
  { key: 'private_equity', label: 'Private Equity', color: 'oklch(0.65 0.18 305)' },
  { key: 'direct_investment', label: 'Direct Investment', color: 'oklch(0.7 0.14 160)' },
  { key: 'other', label: 'Other', color: 'oklch(0.55 0.05 250)' },
] as const;

function fmtMonth(fecha: string): string {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m] = fecha.split('-');
  return `${monthNames[Number(m) - 1]}-${y.slice(2)}`;
}

export function ForeignEvolutionChart({ history }: { history: ForeignEvolutionPoint[] }) {
  const [mode, setMode] = useState<Mode>('usd');

  const data = history.map((p) => {
    if (mode === 'usd') {
      return {
        fecha: fmtMonth(p.fecha_reporte),
        Equity: p.equity,
        'Fixed Income': p.fixed_income,
        'Private Equity': p.private_equity,
        'Direct Investment': p.direct_investment,
        Other: p.other,
      };
    }
    const t = p.total || 1;
    return {
      fecha: fmtMonth(p.fecha_reporte),
      Equity: (p.equity / t) * 100,
      'Fixed Income': (p.fixed_income / t) * 100,
      'Private Equity': (p.private_equity / t) * 100,
      'Direct Investment': (p.direct_investment / t) * 100,
      Other: (p.other / t) * 100,
    };
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-sm font-medium">
              Foreign Investment Evolution
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              {history.length > 0 && (
                <>
                  {history.length} months · {fmtMonth(history[0].fecha_reporte)} →{' '}
                  {fmtMonth(history[history.length - 1].fecha_reporte)}
                </>
              )}
            </p>
          </div>
          <SegmentedControl
            ariaLabel="Unit"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'usd' as const, label: 'USD MM' },
              { value: 'pct' as const, label: '%' },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 10 }}
                tickMargin={6}
                interval="preserveStartEnd"
                minTickGap={32}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                width={56}
                tickFormatter={(v: number) =>
                  mode === 'usd' ? `${(v / 1000).toFixed(0)}k` : `${v.toFixed(0)}%`
                }
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const total = mode === 'usd'
                    ? payload.reduce((s, p) => s + (Number(p.value) || 0), 0)
                    : 100;
                  return (
                    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-[11px] shadow-sm space-y-0.5">
                      <div className="font-medium border-b border-border/40 pb-1 mb-1">
                        {label}
                      </div>
                      {[...payload].reverse().map((p) => (
                        <div key={String(p.dataKey)} className="flex items-baseline gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="flex-1 truncate">{String(p.dataKey)}</span>
                          <span className="tabular-nums">
                            {mode === 'usd'
                              ? fmtUsdMM(Number(p.value) || 0)
                              : `${(Number(p.value) || 0).toFixed(1)}%`}
                          </span>
                        </div>
                      ))}
                      {mode === 'usd' && (
                        <div className="flex items-baseline gap-2 border-t border-border/40 pt-1 mt-1 font-semibold">
                          <span className="flex-1">Total</span>
                          <span className="tabular-nums">{fmtUsdMM(total)}</span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.label}
                  stackId="1"
                  stroke={s.color}
                  fill={s.color}
                  fillOpacity={0.7}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
