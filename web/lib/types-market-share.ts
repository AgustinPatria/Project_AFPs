// Pure types and helpers safe to import from client components.
// Do NOT import from supabase-server here.

export const TIPO_FONDOS = ['A', 'B', 'C', 'D', 'E', 'TOTAL'] as const;
export type TipoFondo = (typeof TIPO_FONDOS)[number];

export const AFPS_RETURN = [
  'CAPITAL',
  'CUPRUM',
  'HABITAT',
  'MODELO',
  'PLANVITAL',
  'PROVIDA',
  'UNO',
] as const;
export type AfpReturn = (typeof AFPS_RETURN)[number];

export type AumRow = {
  afp: string;
  tipo_fondo: string;
  aum_usd_mm: number;
  aum_clp_bn: number;
};

export type ReturnsRow = {
  afp: string;
  tipo_fondo: string;
  ret_mom_clp: number | null;
  ret_ytd_clp: number | null;
  ret_ltm_clp: number | null;
  ret_mom_usd: number | null;
  ret_ytd_usd: number | null;
  ret_ltm_usd: number | null;
};

export type FlowsRow = {
  afp: string;
  tipo_fondo: string;
  flow_mom_usd_mm: number | null;
  flow_ytd_usd_mm: number | null;
  flow_ltm_usd_mm: number | null;
};

export type ContributorsRow = {
  afp: string;
  fecha_cotizantes: string | null;
  aum_usd_mm: number;
  n_cotizantes: number | null;
  avg_usd_per_cotiz: number | null;
  share_aum: number | null;
  share_cotiz: number | null;
};

export type CalendarYearReturns = { year: number; rows: ReturnsRow[] };
export type CalendarYearFlows = { year: number; rows: FlowsRow[] };

// Most recent COMPLETE calendar years preceding `fecha` (YYYY-MM-DD).
// A year is complete when fecha falls in December — otherwise the running year
// is treated as incomplete and the prior year is the most recent complete one.
export function recentCompleteYears(fecha: string, count = 2): number[] {
  const [yStr, mStr] = fecha.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const mostRecent = m === 12 ? y : y - 1;
  return Array.from({ length: count }, (_, i) => mostRecent - i);
}

// Colores estables por AFP — usados para los pies y la leyenda.
export const AFP_COLOR: Record<string, string> = {
  HABITAT: '#0f172a',
  PROVIDA: '#ea580c',
  CAPITAL: '#06b6d4',
  CUPRUM: '#a78bfa',
  MODELO: '#fbbf24',
  PLANVITAL: '#f472b6',
  UNO: '#10b981',
};

/**
 * Pivots an AFP × tipo_fondo array into a row-per-AFP shape.
 * Result is sorted by AFPS_RETURN order with system TOTAL last.
 */
export function pivotByAfp<R extends { afp: string; tipo_fondo: string }>(
  rows: R[],
  valueKey: keyof R,
): { afp: string; values: Record<string, number | null> }[] {
  const byAfp = new Map<string, Record<string, number | null>>();
  const seenAfps = new Set<string>();
  for (const r of rows) {
    seenAfps.add(r.afp);
    if (!byAfp.has(r.afp)) byAfp.set(r.afp, {});
    const v = r[valueKey];
    byAfp.get(r.afp)![r.tipo_fondo] =
      typeof v === 'number' ? v : v == null ? null : Number(v);
  }
  const ordered: string[] = [];
  for (const a of AFPS_RETURN) if (seenAfps.has(a)) ordered.push(a);
  for (const a of Array.from(seenAfps).sort()) {
    if (!ordered.includes(a) && a !== 'TOTAL') ordered.push(a);
  }
  if (seenAfps.has('TOTAL')) ordered.push('TOTAL');
  return ordered.map((afp) => ({ afp, values: byAfp.get(afp) ?? {} }));
}
