export const AFPS = [
  'BANSANDER',
  'CAPITAL',
  'CUPRUM',
  'HABITAT',
  'MODELO',
  'PLANVITAL',
  'PROVIDA',
  'UNO',
] as const;

export const C1_CATEGORIES = [
  'Private Equity',
  'Private Debt',
  'Real Asset',
  'Other Alternative',
  'Local',
] as const;

export type AfpName = (typeof AFPS)[number];
export type C1Name = (typeof C1_CATEGORIES)[number];

// Canonical per-AFP colors — the single source of truth (task 6.1: one fixed
// color per AFP, consistent across every module). Medium-lightness oklch hues
// stay legible on the dark theme; BANSANDER (legacy AFP) is a neutral grey.
// All AFP-keyed charts/legends/dots must read from here (directly or via the
// AFP_COLOR/AFP_COLORS re-exports in the per-module type files).
export const AFP_COLORS: Record<AfpName, string> = {
  BANSANDER: 'oklch(0.6 0 0)',
  CAPITAL: 'oklch(0.75 0.16 50)',
  CUPRUM: 'oklch(0.7 0.14 160)',
  HABITAT: 'oklch(0.65 0.18 250)',
  MODELO: 'oklch(0.65 0.18 305)',
  PLANVITAL: 'oklch(0.78 0.16 100)',
  PROVIDA: 'oklch(0.65 0.18 360)',
  UNO: 'oklch(0.78 0.03 220)',
};

// Safe lookup for arbitrary AFP strings (falls back to BANSANDER's grey).
export function afpColor(afp: string): string {
  return AFP_COLORS[afp as AfpName] ?? 'oklch(0.6 0 0)';
}

// Canonical per-asset-class colors — single source (task 6.2: consistent color
// per asset class across modules). Each asset-class CONCEPT has one hue used
// everywhere it appears (Asset Allocation over-time cuts + Foreign breakdowns):
//   Equity = blue · Fixed Income = orange · Direct Investment = green
//   Private Equity = violet · Other = slate.
// The Local/Foreign geography split (Local vs Foreign cut) and the 4-category
// matrix reuse the same families: equity in a blue family (local deep / foreign
// light), fixed income in an orange family. These never share a legend with the
// aggregate keys, so a hue reused across cuts is fine. NOT for vehicle type
// (active/passive/ETF) or geography region, which are separate taxonomies.
export const ASSET_CLASS_COLORS = {
  equity: 'oklch(0.65 0.18 250)', // blue
  fixed_income: 'oklch(0.68 0.17 45)', // orange
  direct_investment: 'oklch(0.70 0.14 160)', // green
  private_equity: 'oklch(0.60 0.17 305)', // violet
  other: 'oklch(0.72 0.04 250)', // slate
  // Local vs Foreign aggregate cut.
  local: 'oklch(0.64 0.14 160)', // green
  foreign: 'oklch(0.58 0.16 285)', // indigo
  // 4-category: equity (blue family) and fixed income (orange family), with
  // Local rendered deeper and Foreign lighter within each family.
  local_equity: 'oklch(0.55 0.17 250)',
  foreign_equity: 'oklch(0.76 0.13 250)',
  local_fixed_income: 'oklch(0.60 0.16 45)',
  foreign_fixed_income: 'oklch(0.82 0.13 70)',
} as const;

export type OverviewRow = {
  afp: string;
  aum: number;
  nav: number;
  uncalled: number;
  total: number;
};

// Per-multifondo (A–E) breakdown of an AFP's alternatives, shown when a Summary
// AFP row is expanded. Same metrics as OverviewRow, keyed by fund type.
export type MultifondoRow = {
  multifondo: string;
  aum: number;
  nav: number;
  uncalled: number;
  total: number;
};

export type AfpC1Row = {
  afp: string;
} & Record<C1Name, number>;

export type EvolutionPoint = {
  fecha: string;
} & Partial<Record<AfpName, number>>;
