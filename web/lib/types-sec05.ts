export type Sec05QuartileRow = {
  cuartil: '1' | '2' | '3' | '4' | 'Other';
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
  cuartil: '1' | '2' | '3' | '4' | 'Other' | null;
  gics_name: string | null;
  gics_chist: string | null;
  monto_usd_mm: number;
  weight: number;
};
