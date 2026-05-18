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

export type OverviewRow = {
  afp: string;
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
