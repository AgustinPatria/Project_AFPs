'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ASSET_CLASS_COLORS } from '@/lib/dimensions';
import { fmtUsdMM } from '@/lib/format';
import type { LatamMonthPoint } from '@/lib/queries-foreign-latam';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonth(fecha: string): string {
  const [y, m] = fecha.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

// Asset-class colors from the canonical palette (task 6.2). Vehicle-type colors
// below (active/passive/ETF/funds) are a separate taxonomy, left as-is.
const C_EQUITY = ASSET_CLASS_COLORS.equity;
const C_FI = ASSET_CLASS_COLORS.fixed_income;
const C_DI = ASSET_CLASS_COLORS.direct_investment;
const C_ACTIVE = 'oklch(0.65 0.18 250)';
const C_ETF = 'oklch(0.7 0.16 200)';
const C_PASSIVE = 'oklch(0.6 0.14 280)';
const C_FUNDS = 'oklch(0.65 0.18 30)';

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const tooltipUsd = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-[11px] shadow-sm space-y-0.5">
      <div className="font-medium border-b border-border/40 pb-1 mb-1">{label}</div>
      {[...payload].reverse().map((p: any) => (
        <div key={String(p.dataKey)} className="flex items-baseline gap-2">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: p.color }}
          />
          <span className="flex-1 truncate">{String(p.dataKey)}</span>
          <span className="tabular-nums">{fmtUsdMM(Number(p.value) || 0)}</span>
        </div>
      ))}
      <div className="flex items-baseline gap-2 border-t border-border/40 pt-1 mt-1 font-semibold">
        <span className="flex-1">Total</span>
        <span className="tabular-nums">{fmtUsdMM(total)}</span>
      </div>
    </div>
  );
};

const tooltipPct = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-[11px] shadow-sm space-y-0.5">
      <div className="font-medium border-b border-border/40 pb-1 mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={String(p.dataKey)} className="flex items-baseline gap-2">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: p.color }}
          />
          <span className="flex-1 truncate">{String(p.dataKey)}</span>
          <span className="tabular-nums">{(Number(p.value) || 0).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
};

export function ForeignLatamCharts({
  series,
}: {
  series: LatamMonthPoint[];
}) {
  // Per-month derived rows used by each chart.
  const rows = series.map((p) => {
    const eqTotal = p.eq_active + p.eq_etf + p.eq_passive + p.eq_di;
    const fiTotal = p.fi_funds + p.fi_di;
    const latamTotal = eqTotal + fiTotal;
    const latamFunds = p.eq_active + p.eq_etf + p.eq_passive + p.fi_funds;
    const pct = (v: number) =>
      p.total_foreign > 0 ? (v / p.total_foreign) * 100 : 0;
    return {
      fecha: fmtMonth(p.fecha_reporte),
      // USD MM (with DI)
      Equity: eqTotal,
      'Fixed Income': fiTotal,
      // USD MM (excluding DI)
      'Equity Funds': p.eq_active + p.eq_etf + p.eq_passive,
      'Fixed Income Funds': p.fi_funds,
      // % of Foreign (with DI)
      'Equity %': pct(eqTotal),
      'Fixed Income %': pct(fiTotal),
      // % of Foreign Funds (excluding DI)
      'Equity Funds %': pct(p.eq_active + p.eq_etf + p.eq_passive),
      'Fixed Income Funds %': pct(p.fi_funds),
      // Style breakdown — Equity Latam
      Active: p.eq_active,
      ETF: p.eq_etf,
      Passive: p.eq_passive,
      'Equity DI': p.eq_di,
      // FI breakdown
      Funds: p.fi_funds,
      'FI DI': p.fi_di,
      // Totals (for tooltips/legends)
      _latamTotal: latamTotal,
      _latamFunds: latamFunds,
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Row 1 — USD MM with/without DI */}
      <ChartCard title="Latam (USD mm)">
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
          <Tooltip content={tooltipUsd} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
          <Bar dataKey="Equity" stackId="latam" fill={C_EQUITY} isAnimationActive={false} />
          <Bar dataKey="Fixed Income" stackId="latam" fill={C_FI} isAnimationActive={false} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Latam Funds (USD mm) · excludes Direct Investment">
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
          <Tooltip content={tooltipUsd} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
          <Bar dataKey="Equity Funds" stackId="latam" fill={C_EQUITY} isAnimationActive={false} />
          <Bar dataKey="Fixed Income Funds" stackId="latam" fill={C_FI} isAnimationActive={false} />
        </BarChart>
      </ChartCard>

      {/* Row 2 — % of Foreign with/without DI */}
      <ChartCard title="Latam (% of foreign investment)">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <Tooltip content={tooltipPct} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
          <Line type="monotone" dataKey="Equity %" stroke={C_EQUITY} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="Fixed Income %" stroke={C_FI} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Latam Funds (% of foreign investment) · excludes Direct Investment">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <Tooltip content={tooltipPct} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
          <Line type="monotone" dataKey="Equity Funds %" stroke={C_EQUITY} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="Fixed Income Funds %" stroke={C_FI} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ChartCard>

      {/* Row 3 — Style/source breakdown */}
      <ChartCard title="Equity Latam (USD mm) · by style">
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
          <Tooltip content={tooltipUsd} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
          <Bar dataKey="Active" stackId="eq" fill={C_ACTIVE} isAnimationActive={false} />
          <Bar dataKey="ETF" stackId="eq" fill={C_ETF} isAnimationActive={false} />
          <Bar dataKey="Passive" stackId="eq" fill={C_PASSIVE} isAnimationActive={false} />
          <Bar dataKey="Equity DI" stackId="eq" fill={C_DI} isAnimationActive={false} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Fixed Income Latam (USD mm) · by source">
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
          <Tooltip content={tooltipUsd} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
          <Bar dataKey="Funds" stackId="fi" fill={C_FUNDS} isAnimationActive={false} />
          <Bar dataKey="FI DI" stackId="fi" fill={C_DI} isAnimationActive={false} />
        </BarChart>
      </ChartCard>
    </div>
  );
}
