export type Sec08FlowRow = {
  fecha: string;
  period_type: 'MTD' | 'YTD' | 'LTM';
  direction: 'inflow' | 'outflow';
  rk: number;
  fondo: string;
  amount_usd_mm: number;
};
