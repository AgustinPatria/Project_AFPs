'use client';

import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
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
import { afpColor } from '@/lib/dimensions';
import { AFP_COLOR, type ContributorsRow } from '@/lib/types-market-share';

const CHART_CONFIG = Object.fromEntries(
  Object.entries(AFP_COLOR).map(([afp, color]) => [
    afp,
    { label: afp, color },
  ]),
) satisfies ChartConfig;

const NUM = new Intl.NumberFormat('en-US');

type View = 'amount' | 'contrib';

const VIEW_LABEL: Record<View, string> = {
  amount: 'By Amount',
  contrib: 'By # Contributors',
};

export function ContributorsSection({ rows }: { rows: ContributorsRow[] }) {
  const [view, setView] = useState<View>('amount');

  // Filter to AFPs that actually have a cotizantes match for this fecha.
  const usable = rows.filter(
    (r) => r.n_cotizantes != null && r.share_cotiz != null,
  );

  const slices = useMemo(() => {
    const built = usable.map((r) =>
      view === 'amount'
        ? {
            afp: r.afp,
            value: r.aum_usd_mm,
            share: r.share_aum ?? 0,
          }
        : {
            afp: r.afp,
            value: r.n_cotizantes ?? 0,
            share: r.share_cotiz ?? 0,
          },
    );
    return built.sort((a, b) => b.share - a.share);
  }, [usable, view]);

  if (usable.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No contributors data available for this report date yet.
      </div>
    );
  }

  // Sorted by AFP alpha for the table (matches PDF layout).
  const tableRows = [...usable].sort((a, b) => a.afp.localeCompare(b.afp));
  const totalAvg =
    (usable.reduce((s, r) => s + r.aum_usd_mm, 0) * 1000) /
    Math.max(
      1,
      usable.reduce((s, r) => s + (r.n_cotizantes ?? 0), 0),
    );
  const totalContrib = usable.reduce(
    (s, r) => s + (r.n_cotizantes ?? 0),
    0,
  );

  // All rows share the same fecha_cotizantes (the lateral join uses the same
  // SP publication for every AFP at a given fecha_reporte).
  const fechaCotiz = usable[0].fecha_cotizantes;

  const valueLabel = (v: number) =>
    view === 'amount' ? `${fmtUsdMM(v)} USD MM` : NUM.format(v);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Market Share {view === 'amount' ? 'by Amount' : 'by Number of Contributors'}
          </div>
          <SegmentedControl
            ariaLabel="Contributors view"
            value={view}
            onChange={setView}
            options={(['amount', 'contrib'] as View[]).map((v) => ({
              value: v,
              label: VIEW_LABEL[v],
            }))}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-center">
          <ChartContainer config={CHART_CONFIG} className="h-72 w-full">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideIndicator
                    formatter={(value, name) => [
                      ` ${fmtPct(
                        slices.find((s) => s.afp === String(name))?.share ?? 0,
                      )} · ${valueLabel(Number(value))}`,
                      String(name),
                    ]}
                  />
                }
              />
              <Pie
                data={slices}
                dataKey="value"
                nameKey="afp"
                innerRadius={0}
                outerRadius="92%"
                stroke="var(--background)"
                strokeWidth={1}
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.afp} fill={afpColor(s.afp)} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="text-xs space-y-1.5">
            {slices.map((s) => (
              <li key={s.afp} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-[2px] shrink-0"
                  style={{ backgroundColor: afpColor(s.afp) }}
                />
                <span className="font-medium tabular-nums">
                  {fmtPct(s.share)}
                </span>
                <span className="text-muted-foreground">{s.afp}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Contributors
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>AFP</TableHead>
              <TableHead className="text-right">AVG (USD M)</TableHead>
              <TableHead className="text-right"># Contrib.</TableHead>
              <TableHead className="text-right">% Contrib.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map((r) => (
              <TableRow key={r.afp}>
                <TableCell className="font-medium">{r.afp}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.avg_usd_per_cotiz != null
                    ? fmtUsdMM(r.avg_usd_per_cotiz, 1)
                    : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.n_cotizantes != null ? NUM.format(r.n_cotizantes) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.share_cotiz != null ? fmtPct(r.share_cotiz) : '—'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtUsdMM(totalAvg, 1)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {NUM.format(totalContrib)}
              </TableCell>
              <TableCell className="text-right tabular-nums">100.0%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {fechaCotiz && (
          <p className="text-[11px] text-muted-foreground italic mt-2">
            * Contributors data as of {fechaCotiz}
          </p>
        )}
      </div>
    </div>
  );
}
