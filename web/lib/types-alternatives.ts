// Pure types + constants for the Alternative Assets report (alts PDF Sec 01).
// No supabase-server import — safe for client components.

export const ALT_AFPS = [
  'CAPITAL',
  'CUPRUM',
  'HABITAT',
  'MODELO',
  'PLANVITAL',
  'PROVIDA',
  'UNO',
] as const;

export type AltAfp = (typeof ALT_AFPS)[number];
export type AfpOrSystem = AltAfp | 'SYSTEM';

// One month of a multi-series chart: { fecha, <seriesKey>: usd_mm }.
export type SeriesPoint = { fecha: string } & { [key: string]: number | string };

// Strategy buckets exactly as the legacy workbook charts them: buckets are
// defined by Alt_Strategy (+ Local/Foreign region), aggregating over
// Alt_Fund_Type, with Infrastructure/Real Estate as strategy roll-ups.
export const PE_STRATEGIES = ['Buyout', 'Growth', 'Venture Capital'] as const;
export const PD_STRATEGIES = [
  'Direct Lending',
  'Mezzanine',
  'Opportunistic (Debt)',
  'Syndicated Loan',
] as const;
export const INFRA_STRATEGIES = ['Brownfield', 'Greenfield'] as const;
export const RE_STRATEGIES = [
  'Core',
  'Core Plus',
  'Value Add',
  'Opportunistic (RE)',
] as const;

export const RA_KEYS = ['Infrastructure', 'Real Estate'] as const;
export const LOCAL_KEYS = [
  'Local Private Equity',
  'Local Private Debt',
  'Local Infrastructure',
  'Local Real Estate',
  'Local Other Alternative',
] as const;

export type AfpDetailSeries = {
  byC1: SeriesPoint[]; // keys: C1 categories
  foreignPE: SeriesPoint[]; // keys: PE_STRATEGIES
  foreignPD: SeriesPoint[]; // keys: PD_STRATEGIES
  foreignRA: SeriesPoint[]; // keys: RA_KEYS
  local: SeriesPoint[]; // keys: LOCAL_KEYS
};

export const AFP_COLORS: Record<AltAfp, string> = {
  CAPITAL: 'oklch(0.75 0.16 50)',
  CUPRUM: 'oklch(0.7 0.14 160)',
  HABITAT: 'oklch(0.65 0.18 250)',
  MODELO: 'oklch(0.65 0.18 305)',
  PLANVITAL: 'oklch(0.78 0.16 100)',
  PROVIDA: 'oklch(0.65 0.18 360)',
  UNO: 'oklch(0.78 0.03 220)',
};

export const C1_COLORS: Record<string, string> = {
  'Private Equity': 'oklch(0.65 0.18 250)',
  'Private Debt': 'oklch(0.7 0.14 160)',
  'Real Asset': 'oklch(0.75 0.16 50)',
  'Other Alternative': 'oklch(0.6 0 0)',
  Local: 'oklch(0.65 0.18 305)',
};

// Shared sequential palette for strategy-level charts.
export const STRATEGY_PALETTE = [
  'oklch(0.65 0.18 250)',
  'oklch(0.7 0.14 160)',
  'oklch(0.75 0.16 50)',
  'oklch(0.65 0.18 305)',
  'oklch(0.78 0.16 100)',
] as const;

export function paletteFor(keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    keys.map((k, i) => [k, STRATEGY_PALETTE[i % STRATEGY_PALETTE.length]]),
  );
}

// Pivot long rows (fecha, key, value) into chart-ready points sorted by fecha,
// accumulating duplicated (fecha, key) pairs.
export function pivotSeries(
  rows: { fecha: string; key: string; value: number }[],
  keys: readonly string[],
): SeriesPoint[] {
  const keySet = new Set(keys);
  const byFecha = new Map<string, SeriesPoint>();
  for (const r of rows) {
    if (!keySet.has(r.key)) continue;
    let point = byFecha.get(r.fecha);
    if (!point) {
      point = { fecha: r.fecha };
      for (const k of keys) point[k] = 0;
      byFecha.set(r.fecha, point);
    }
    point[r.key] = (Number(point[r.key]) || 0) + r.value;
  }
  return [...byFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}
