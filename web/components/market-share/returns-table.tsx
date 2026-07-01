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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fmtSignedPct } from '@/lib/format';
import {
  type CalendarYearReturns,
  type CuotaPoint,
  type ReturnsRow,
  customRangeReturns,
  pivotByAfp,
} from '@/lib/types-market-share';
import { cn } from '@/lib/utils';

const TIPO_COLS = ['A', 'B', 'C', 'D', 'E'] as const;

type Window = 'mom' | 'ytd' | 'ltm';
type Currency = 'clp' | 'usd';
type Tab = Window | 'custom' | `cy-${number}`;

const WINDOW_LABEL: Record<Window, string> = {
  mom: 'Monthly',
  ytd: 'YTD',
  ltm: 'LTM',
};

function heatmapBg(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (u < 0.5) {
    const k = u * 2;
    r = Math.round(239 + (234 - 239) * k);
    g = Math.round(68 + (179 - 68) * k);
    b = Math.round(68 + (8 - 68) * k);
  } else {
    const k = (u - 0.5) * 2;
    r = Math.round(234 + (16 - 234) * k);
    g = Math.round(179 + (185 - 179) * k);
    b = Math.round(8 + (129 - 8) * k);
  }
  return `rgba(${r}, ${g}, ${b}, 0.28)`;
}

export function ReturnsTable({
  rows,
  calendarYears = [],
  cuotaSeries = [],
}: {
  rows: ReturnsRow[];
  calendarYears?: CalendarYearReturns[];
  cuotaSeries?: CuotaPoint[];
}) {
  const allDates = useMemo(
    () => [...new Set(cuotaSeries.map((r) => r.fecha))].sort(),
    [cuotaSeries],
  );
  const [tab, setTab] = useState<Tab>('mom');
  const [ccy, setCcy] = useState<Currency>('clp');
  const [customEnd, setCustomEnd] = useState<string>(
    () => allDates[allDates.length - 1] ?? '',
  );
  const [customStart, setCustomStart] = useState<string>(
    () => allDates[Math.max(0, allDates.length - 13)] ?? '',
  );

  const isCY = tab.startsWith('cy-');
  const isCustom = tab === 'custom';
  const activeRows = isCY
    ? calendarYears.find((c) => `cy-${c.year}` === tab)?.rows ?? []
    : rows;
  // For calendar years the CY return = YTD value at Dec-31 of that year.
  const valueKey = (isCY
    ? `ret_ytd_${ccy}`
    : `ret_${tab}_${ccy}`) as keyof ReturnsRow;
  const pivoted = useMemo(
    () =>
      isCustom
        ? pivotByAfp(
            customRangeReturns(cuotaSeries, customStart, customEnd, ccy),
            'ret_custom',
          )
        : pivotByAfp(activeRows, valueKey),
    [isCustom, cuotaSeries, customStart, customEnd, ccy, activeRows, valueKey],
  );
  const tabLabel = isCustom
    ? `${customStart} → ${customEnd}`
    : isCY
      ? tab.slice(3)
      : WINDOW_LABEL[tab as Window];

  const colExtents = useMemo(() => {
    const ext: Record<string, { lo: number; hi: number }> = {};
    for (const t of TIPO_COLS) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const { afp, values } of pivoted) {
        if (afp === 'TOTAL') continue;
        const v = values[t];
        if (typeof v === 'number') {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      ext[t] = { lo, hi };
    }
    return ext;
  }, [pivoted]);

  const fmt = (n: number | null | undefined) =>
    n == null ? '—' : fmtSignedPct(n);

  function cellBgStyle(v: number | null | undefined, fund: string) {
    if (v == null) return undefined;
    const ext = colExtents[fund];
    if (!ext || ext.lo === ext.hi || !Number.isFinite(ext.lo)) return undefined;
    const t = (v - ext.lo) / (ext.hi - ext.lo);
    return { backgroundColor: heatmapBg(t) };
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          Returns by AFP × Fund Type · {tabLabel} ·{' '}
          {ccy === 'clp' ? 'CLP' : 'USD'}
        </div>
        <div className="flex gap-2 flex-wrap">
          <SegmentedControl<Tab>
            ariaLabel="Returns window"
            value={tab}
            onChange={setTab}
            options={[
              ...(['mom', 'ytd', 'ltm'] as Window[]).map((w) => ({
                value: w as Tab,
                label: WINDOW_LABEL[w],
              })),
              ...calendarYears.map((c) => ({
                value: `cy-${c.year}` as Tab,
                label: String(c.year),
              })),
              ...(allDates.length > 0
                ? [{ value: 'custom' as Tab, label: 'Custom' }]
                : []),
            ]}
          />
          <SegmentedControl
            ariaLabel="Currency"
            value={ccy}
            onChange={setCcy}
            options={[
              { value: 'clp', label: 'CLP' },
              { value: 'usd', label: 'USD' },
            ]}
          />
        </div>
      </div>
      {isCustom && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">From</span>
          <Select
            value={customStart}
            onValueChange={(v) => setCustomStart(v ?? customStart)}
          >
            <SelectTrigger
              className="w-[130px] tabular-nums"
              aria-label="Start date"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...allDates].reverse().map((d) => (
                <SelectItem key={d} value={d} className="tabular-nums">
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">to</span>
          <Select
            value={customEnd}
            onValueChange={(v) => setCustomEnd(v ?? customEnd)}
          >
            <SelectTrigger
              className="w-[130px] tabular-nums"
              aria-label="End date"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...allDates].reverse().map((d) => (
                <SelectItem key={d} value={d} className="tabular-nums">
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[20%]" />
          {TIPO_COLS.map((t) => (
            <col key={t} className="w-[16%]" />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>AFP</TableHead>
            {TIPO_COLS.map((t) => (
              <TableHead key={t} className="text-right">
                Fund {t}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pivoted
            .filter((p) => p.afp !== 'TOTAL')
            .map(({ afp, values }) => (
              <TableRow key={afp}>
                <TableCell className="font-medium">{afp}</TableCell>
                {TIPO_COLS.map((t) => {
                  const v = values[t] as number | null | undefined;
                  return (
                    <TableCell
                      key={t}
                      className={cn(
                        'text-right tabular-nums',
                        v == null && 'text-muted-foreground',
                      )}
                      style={cellBgStyle(v, t)}
                    >
                      {fmt(v)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
        <span>Worst</span>
        <span
          className="inline-block h-2 w-32 rounded-sm border border-border"
          style={{
            background:
              'linear-gradient(to right, rgba(239,68,68,0.55), rgba(234,179,8,0.55), rgba(16,185,129,0.55))',
          }}
          aria-hidden
        />
        <span>Best</span>
        <span className="ml-2 opacity-70">(scaled per fund column)</span>
      </div>
    </div>
  );
}
