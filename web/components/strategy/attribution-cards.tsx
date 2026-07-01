'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fmtSignedPct, fmtUsdMM } from '@/lib/format';
import type {
  AttributionPeriod,
  CarteraRow,
  FundReturns,
} from '@/lib/queries-strategy-attribution';

const fmtW = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtBps = (v: number) => `${v >= 0 ? '+' : ''}${(v * 10000).toFixed(0)}`;

function contribBg(v: number, maxAbs: number): string | undefined {
  if (!v || maxAbs <= 0) return undefined;
  const alpha = (0.1 + 0.4 * Math.min(Math.abs(v) / maxAbs, 1)).toFixed(2);
  return v > 0 ? `rgba(16, 185, 129, ${alpha})` : `rgba(244, 63, 94, ${alpha})`;
}

function fmtMonYY(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------- 4.1 top ±

export function ContributorsCard({
  month,
  quarter,
}: {
  month: AttributionPeriod;
  quarter: AttributionPeriod;
}) {
  const [period, setPeriod] = useState<'1M' | '3M'>('1M');
  const data = period === '1M' ? month : quarter;

  const { top, bottom, maxAbs } = useMemo(() => {
    const sorted = data.rows; // ya viene ordenado por contrib_total desc
    const top = sorted.filter((r) => r.contrib_total > 0).slice(0, 8);
    const bottom = sorted
      .filter((r) => r.contrib_total < 0)
      .slice(-8)
      .reverse();
    const maxAbs = Math.max(
      ...[...top, ...bottom].map((r) => Math.abs(r.contrib_total)),
      1e-9,
    );
    return { top, bottom, maxAbs };
  }, [data]);

  const label = data.months.length === 1
    ? fmtMonYY(data.months[0])
    : `${fmtMonYY(data.months[0])} → ${fmtMonYY(data.months[data.months.length - 1])}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <SegmentedControl
          options={[
            { value: '1M', label: '1M' },
            { value: '3M', label: '3M' },
          ]}
          value={period}
          onChange={setPeriod}
          ariaLabel="Attribution period"
        />
      </div>

      <Table className="table-fixed">
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[12%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Instrument</TableHead>
            <TableHead className="text-right">Avg W</TableHead>
            <TableHead className="text-right">Contribution (bps)</TableHead>
            <TableHead className="text-right">Price (bps)</TableHead>
            <TableHead className="text-right">FX / carry (bps)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...top, ...bottom].map((r) => (
            <TableRow key={r.id_instrumento}>
              <TableCell className="font-medium truncate" title={r.company ?? undefined}>
                {r.instrumento ?? `#${r.id_instrumento}`}
                {r.company && (
                  <span className="block text-[10px] text-muted-foreground truncate">
                    {r.company} · {r.currency ?? ''}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtW(r.avg_weight)}
              </TableCell>
              <TableCell
                className="text-right tabular-nums"
                style={{ backgroundColor: contribBg(r.contrib_total, maxAbs) }}
              >
                {fmtBps(r.contrib_total)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtBps(r.contrib_price)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtBps(r.contrib_fx_carry)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-[11px] text-muted-foreground">
        Σ position contributions = {fmtSignedPct(data.ret_calc)}
        {data.ret_serie != null && Math.abs(data.residual ?? 0) <= 0.02 && (
          <>
            {' '}· official share-class return = {fmtSignedPct(data.ret_serie)} ·
            income / cash &amp; other (residual) ={' '}
            {fmtSignedPct(data.residual ?? 0)}
          </>
        )}
        {data.ret_serie != null && Math.abs(data.residual ?? 0) > 0.02 && (
          <>
            {' '}· share-class NAV return ({fmtSignedPct(data.ret_serie)}) not
            comparable this period — distribution / share-class event in the
            cuota, not portfolio P&amp;L
          </>
        )}
        . Price + FX/carry decomposition from daily positions (TBL_IPA_V2);
        dividends and coupons received settle into cash and appear in the
        residual, not per instrument.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- 4.1 cartera

export function CarteraCard({
  fecha,
  navUsd,
  rows,
}: {
  fecha: string;
  navUsd: number;
  rows: CarteraRow[];
}) {
  const [showAll, setShowAll] = useState(false);
  const invested = rows.filter((r) => r.source !== 'CASH APPRAISAL');
  const cash = rows.filter((r) => r.source === 'CASH APPRAISAL');
  const cashWeight = cash.reduce((s, r) => s + r.weight, 0);
  const visible = showAll ? invested : invested.slice(0, 15);
  const rest = invested.slice(15);
  const restWeight = rest.reduce((s, r) => s + r.weight, 0);

  return (
    <div className="space-y-3">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[48%]" />
          <col className="w-[12%]" />
          <col className="w-[20%]" />
          <col className="w-[20%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>Instrument</TableHead>
            <TableHead>CCY</TableHead>
            <TableHead className="text-right">MVal (USD MM)</TableHead>
            <TableHead className="text-right">Weight</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={`${r.id_instrumento}-${r.source}`}>
              <TableCell className="font-medium truncate" title={r.company ?? undefined}>
                {r.instrumento ?? `#${r.id_instrumento}`}
                {r.company && (
                  <span className="block text-[10px] text-muted-foreground truncate">
                    {r.company}
                  </span>
                )}
              </TableCell>
              <TableCell>{r.currency ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtUsdMM(r.mval_usd / 1e6, 1)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtW(r.weight)}
              </TableCell>
            </TableRow>
          ))}
          {!showAll && rest.length > 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={3}>
                Other {rest.length} positions
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {fmtW(restWeight)}
              </TableCell>
            </TableRow>
          )}
          {cash.length > 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={3}>
                Cash &amp; equivalents ({cash.length} lines)
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {fmtW(cashWeight)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] text-muted-foreground">
          NAV {fmtUsdMM(navUsd / 1e6)} USD MM · holdings as of {fecha} (Geneva
          via TBL_IPA_V2)
        </p>
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            {showAll ? 'Show top 15' : `Show all ${invested.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 4.2 returns

export function ReturnsAumCard({ returns }: { returns: FundReturns }) {
  const chart = returns.series.map((p) => ({
    mes: fmtMonYY(p.fecha.slice(0, 7)),
    ret: p.mtd == null ? null : p.mtd * 100,
    aum: p.patrimonio == null ? null : p.patrimonio / 1e6,
  }));
  const last = returns.series[returns.series.length - 1];

  return (
    <div className="space-y-3">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[20%]" />
          <col className="w-[20%]" />
          <col className="w-[20%]" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>{last.fecha}</TableHead>
            <TableHead className="text-right">MTD</TableHead>
            <TableHead className="text-right">YTD</TableHead>
            <TableHead className="text-right">1Y</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">
              Fund ({returns.currency})
            </TableCell>
            {[last.mtd, last.ytd, last.y1].map((v, i) => (
              <TableCell key={i} className="text-right tabular-nums">
                {v == null ? '—' : fmtSignedPct(v)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">
              Benchmark{returns.bm_ticker ? ` (${returns.bm_ticker})` : ''}
            </TableCell>
            {[last.bm_mtd, last.bm_ytd, last.bm_y1].map((v, i) => (
              <TableCell
                key={i}
                className="text-right tabular-nums text-muted-foreground"
              >
                {v == null ? '—' : fmtSignedPct(v)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis
              yAxisId="ret"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <YAxis
              yAxisId="aum"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => fmtUsdMM(v)}
            />
            <Tooltip
              formatter={(value, name) =>
                name === 'Monthly return'
                  ? [`${Number(value).toFixed(2)}%`, name]
                  : [`${fmtUsdMM(Number(value))} MM`, name]
              }
            />
            <Bar
              yAxisId="ret"
              dataKey="ret"
              name="Monthly return"
              fill="oklch(0.65 0.18 250)"
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="aum"
              dataKey="aum"
              name={`AUM (${returns.currency} MM)`}
              stroke="oklch(0.65 0.18 30)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Monthly share-class return (bars, left) vs AUM (line, right) —
        return/AUM correlation. Source: TBL_RENTABILIDADES_SERIES
        (Inteligencia_Producto), month-end observations.
      </p>
    </div>
  );
}
