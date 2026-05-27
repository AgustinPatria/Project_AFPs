'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { fmtUsdMM } from '@/lib/format';
import type { AssetClassEvoPoint } from '@/lib/queries-foreign-evolution';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonth(fecha: string): string {
  const [y, m] = fecha.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

const C_EM = 'oklch(0.65 0.18 30)';
const C_DM = 'oklch(0.65 0.18 250)';

// Per-subregion palette tuned for stacked charts on dark bg.
const SUBREGION_COLORS: Record<string, string> = {
  GEM: 'oklch(0.65 0.18 30)',
  Latam: 'oklch(0.7 0.16 60)',
  'Asia Pacific': 'oklch(0.65 0.18 140)',
  'Asia Pacific ex Japan': 'oklch(0.65 0.18 140)',
  'Emerging Europe': 'oklch(0.6 0.14 350)',
  Global: 'oklch(0.65 0.18 250)',
  'North America': 'oklch(0.7 0.16 200)',
  Europe: 'oklch(0.6 0.14 280)',
  Japan: 'oklch(0.65 0.18 90)',
};

type Props = {
  title: string; // "Fixed Income" or "Equity"
  series: AssetClassEvoPoint[];
  emSubregions: string[]; // ordered subregions for stack
  dmSubregions: string[];
};

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
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />
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
      {[...payload].reverse().map((p: any) => (
        <div key={String(p.dataKey)} className="flex items-baseline gap-2">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />
          <span className="flex-1 truncate">{String(p.dataKey)}</span>
          <span className="tabular-nums">{(Number(p.value) || 0).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
};

export function ForeignClassEvolution({
  title,
  series,
  emSubregions,
  dmSubregions,
}: Props) {
  // Top-level: EM vs DM
  const usdRows = series.map((p) => ({
    fecha: fmtMonth(p.fecha_reporte),
    'Emerging Markets': p.em_total,
    'Developed Markets': p.dm_total,
  }));
  const pctRows = series.map((p) => {
    const t = p.em_total + p.dm_total || 1;
    return {
      fecha: fmtMonth(p.fecha_reporte),
      'Emerging Markets': (p.em_total / t) * 100,
      'Developed Markets': (p.dm_total / t) * 100,
    };
  });
  // % within EM (sum to 100%)
  const emPctRows = series.map((p) => {
    const t = p.em_total || 1;
    const row: Record<string, number | string> = { fecha: fmtMonth(p.fecha_reporte) };
    for (const sr of emSubregions) {
      row[sr] = ((p.em_by_subregion[sr] ?? 0) / t) * 100;
    }
    return row;
  });
  // % within DM
  const dmPctRows = series.map((p) => {
    const t = p.dm_total || 1;
    const row: Record<string, number | string> = { fecha: fmtMonth(p.fecha_reporte) };
    for (const sr of dmSubregions) {
      row[sr] = ((p.dm_by_subregion[sr] ?? 0) / t) * 100;
    }
    return row;
  });
  // Net Change (proxy for flows) — t vs t-1
  const flowsEmDm = series.map((p, i) => {
    const prev = series[i - 1];
    return {
      fecha: fmtMonth(p.fecha_reporte),
      'Emerging Markets': prev ? p.em_total - prev.em_total : 0,
      'Developed Markets': prev ? p.dm_total - prev.dm_total : 0,
    };
  });
  const flowsEm = series.map((p, i) => {
    const prev = series[i - 1];
    const row: Record<string, number | string> = { fecha: fmtMonth(p.fecha_reporte) };
    for (const sr of emSubregions) {
      const cur = p.em_by_subregion[sr] ?? 0;
      const pr = prev ? (prev.em_by_subregion[sr] ?? 0) : cur;
      row[sr] = cur - pr;
    }
    return row;
  });
  const flowsDm = series.map((p, i) => {
    const prev = series[i - 1];
    const row: Record<string, number | string> = { fecha: fmtMonth(p.fecha_reporte) };
    for (const sr of dmSubregions) {
      const cur = p.dm_by_subregion[sr] ?? 0;
      const pr = prev ? (prev.dm_by_subregion[sr] ?? 0) : cur;
      row[sr] = cur - pr;
    }
    return row;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={`${title} (USD mm)`}>
          <AreaChart data={usdRows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={tooltipUsd} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
            <Area type="monotone" dataKey="Emerging Markets" stackId="1" stroke={C_EM} fill={C_EM} fillOpacity={0.7} isAnimationActive={false} />
            <Area type="monotone" dataKey="Developed Markets" stackId="1" stroke={C_DM} fill={C_DM} fillOpacity={0.7} isAnimationActive={false} />
          </AreaChart>
        </ChartCard>

        <ChartCard title={`${title} (%) · share of asset class`}>
          <AreaChart data={pctRows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v: number) => `${v.toFixed(0)}%`} domain={[0, 100]} />
            <Tooltip content={tooltipPct} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
            <Area type="monotone" dataKey="Emerging Markets" stackId="1" stroke={C_EM} fill={C_EM} fillOpacity={0.7} isAnimationActive={false} />
            <Area type="monotone" dataKey="Developed Markets" stackId="1" stroke={C_DM} fill={C_DM} fillOpacity={0.7} isAnimationActive={false} />
          </AreaChart>
        </ChartCard>

        <ChartCard title={`Emerging Markets ${title} (%) · by subregion`}>
          <AreaChart data={emPctRows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v: number) => `${v.toFixed(0)}%`} domain={[0, 100]} />
            <Tooltip content={tooltipPct} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
            {emSubregions.map((sr) => (
              <Area
                key={sr}
                type="monotone"
                dataKey={sr}
                stackId="em"
                stroke={SUBREGION_COLORS[sr] ?? '#888'}
                fill={SUBREGION_COLORS[sr] ?? '#888'}
                fillOpacity={0.7}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ChartCard>

        <ChartCard title={`Developed Markets ${title} (%) · by subregion`}>
          <AreaChart data={dmPctRows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v: number) => `${v.toFixed(0)}%`} domain={[0, 100]} />
            <Tooltip content={tooltipPct} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
            {dmSubregions.map((sr) => (
              <Area
                key={sr}
                type="monotone"
                dataKey={sr}
                stackId="dm"
                stroke={SUBREGION_COLORS[sr] ?? '#888'}
                fill={SUBREGION_COLORS[sr] ?? '#888'}
                fillOpacity={0.7}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ChartCard>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Monthly Net Change (USD mm) — change in position vs prior month. Used as
        a proxy for Net Flows; does not separate Return from Flow (no MTM data
        available yet).
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={`Monthly Net Change · ${title} (USD mm) · EM vs DM`}>
          <BarChart data={flowsEmDm} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
            <Tooltip content={tooltipUsd} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
            <Bar dataKey="Emerging Markets" fill={C_EM} isAnimationActive={false} />
            <Bar dataKey="Developed Markets" fill={C_DM} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title={`Monthly Net Change · ${title} EM (USD mm) · by subregion`}>
          <BarChart data={flowsEm} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => `${v >= 0 ? '+' : '-'}${(Math.abs(v) / 1000).toFixed(1)}k`} />
            <Tooltip content={tooltipUsd} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
            {emSubregions.map((sr) => (
              <Bar
                key={sr}
                dataKey={sr}
                fill={SUBREGION_COLORS[sr] ?? '#888'}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartCard>

        <ChartCard title={`Monthly Net Change · ${title} DM (USD mm) · by subregion`}>
          <BarChart data={flowsDm} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => `${v >= 0 ? '+' : '-'}${(Math.abs(v) / 1000).toFixed(1)}k`} />
            <Tooltip content={tooltipUsd} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" iconSize={10} />
            {dmSubregions.map((sr) => (
              <Bar
                key={sr}
                dataKey={sr}
                fill={SUBREGION_COLORS[sr] ?? '#888'}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}
