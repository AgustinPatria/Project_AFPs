export type Sec05SizeBucket = 'Large' | 'Mid' | 'Small' | 'No IGPA';

// Size = pertenencia a los índices S&P IGPA Large/Mid/Small (BMS 17/18/19).
// Reemplaza a los cuartiles de BDChile (decisión 2026-07-01).
export type Sec05SizeRow = {
  bucket: Sec05SizeBucket;
  pionero_pct: number;
  mrv_pct: number;
  ipsa_pct: number;
  afps_pct: number;
};

export type Sec05IpsaMembershipRow = {
  bucket: 'IPSA' | 'NO IPSA';
  pionero_pct: number;
  mrv_pct: number;
  ipsa_pct: number;
  afps_pct: number;
};

export type Sec05ConcentrationRow = {
  metric: 'companies' | 'top10' | 'top20' | 'top30';
  pionero: number;
  mrv: number;
  ipsa: number;
  afps: number;
};

export type Sec05Top40Row = {
  rk: number;
  nemo: string;
  emisor: string | null;
  company_name: string | null;
  group_name: string | null;
  size_bucket: Sec05SizeBucket | null;
  gics_name: string | null;
  gics_chist: string | null;
  monto_usd_mm: number;
  weight: number;
};
