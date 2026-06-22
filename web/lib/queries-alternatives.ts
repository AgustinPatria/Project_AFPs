import { supabase } from './supabase-server';
import {
  ALT_AFPS,
  INFRA_STRATEGIES,
  LOCAL_KEYS,
  PD_STRATEGIES,
  PE_STRATEGIES,
  RA_KEYS,
  RE_STRATEGIES,
  pivotSeries,
  type AfpDetailSeries,
  type AfpOrSystem,
  type SeriesPoint,
} from './types-alternatives';
import { C1_CATEGORIES } from './dimensions';

// PostgREST caps responses at 1000 rows; v_afp_c2 unfiltered (SYSTEM view)
// exceeds that, so page through with .range().
const PAGE = 1000;

type C2Row = {
  fecha: string;
  afp: string;
  region: 'Local' | 'Foreign';
  alt_strategy: string | null;
  total_usd_mm: number | null;
};

async function fetchAllC2(afp: AfpOrSystem): Promise<C2Row[]> {
  const rows: C2Row[] = [];
  for (let from = 0; ; from += PAGE) {
    // Order by the view's full GROUP BY key — .range() pagination needs a
    // total order or page boundaries can duplicate/drop rows.
    let q = supabase
      .from('v_afp_c2')
      .select('fecha,afp,region,alt_strategy,total_usd_mm')
      .order('fecha', { ascending: true })
      .order('afp', { ascending: true })
      .order('region', { ascending: true })
      .order('category', { ascending: true })
      .order('alt_fund_type', { ascending: true })
      .order('alt_strategy', { ascending: true })
      .range(from, from + PAGE - 1);
    if (afp !== 'SYSTEM') q = q.eq('afp', afp);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data ?? []) as C2Row[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// Total Alternatives (NAV + Uncalled) by C1 category, full history.
export async function getTotalC1Evolution(): Promise<SeriesPoint[]> {
  const { data, error } = await supabase
    .from('v_total_c1')
    .select('fecha,c1,total_usd_mm')
    .order('fecha', { ascending: true });
  if (error) throw error;
  return pivotSeries(
    (data ?? []).map((r) => ({
      fecha: r.fecha as string,
      key: r.c1 as string,
      value: Number(r.total_usd_mm) || 0,
    })),
    C1_CATEGORIES,
  );
}

// NAV and Uncalled by AFP plus the system-level NAV-vs-Uncalled split.
export async function getNavUncalledEvolution(): Promise<{
  navByAfp: SeriesPoint[];
  uncalledByAfp: SeriesPoint[];
  navVsUncalled: SeriesPoint[];
}> {
  const [navRes, uncRes] = await Promise.all([
    supabase
      .from('v_nav')
      .select('fecha,afp,nav_usd_mm')
      .order('fecha', { ascending: true }),
    supabase
      .from('v_uncalled')
      .select('fecha,afp,uncalled_usd_mm')
      .order('fecha', { ascending: true }),
  ]);
  if (navRes.error) throw navRes.error;
  if (uncRes.error) throw uncRes.error;

  const navRows = (navRes.data ?? []).map((r) => ({
    fecha: r.fecha as string,
    key: r.afp as string,
    value: Number(r.nav_usd_mm) || 0,
  }));
  const uncRows = (uncRes.data ?? []).map((r) => ({
    fecha: r.fecha as string,
    key: r.afp as string,
    value: Number(r.uncalled_usd_mm) || 0,
  }));

  const sumByFecha = (rows: { fecha: string; value: number }[], key: string) =>
    rows.map((r) => ({ fecha: r.fecha, key, value: r.value }));

  return {
    navByAfp: pivotSeries(navRows, ALT_AFPS),
    uncalledByAfp: pivotSeries(uncRows, ALT_AFPS),
    navVsUncalled: pivotSeries(
      [...sumByFecha(navRows, 'NAV'), ...sumByFecha(uncRows, 'Uncalled')],
      ['NAV', 'Uncalled'],
    ),
  };
}

// The five evolution charts of one *_Detail PDF page (or SYSTEM = all AFPs).
// Buckets follow the legacy workbook: strategy + region define the bucket,
// Alt_Fund_Type is aggregated over, Infrastructure/Real Estate are roll-ups.
export async function getAfpDetail(afp: AfpOrSystem): Promise<AfpDetailSeries> {
  let c1q = supabase
    .from('v_afp_c1')
    .select('fecha,afp,c1,total_usd_mm')
    .order('fecha', { ascending: true });
  if (afp !== 'SYSTEM') c1q = c1q.eq('afp', afp);

  const [c1Res, c2Rows] = await Promise.all([c1q, fetchAllC2(afp)]);
  if (c1Res.error) throw c1Res.error;

  const byC1 = pivotSeries(
    (c1Res.data ?? []).map((r) => ({
      fecha: r.fecha as string,
      key: r.c1 as string,
      value: Number(r.total_usd_mm) || 0,
    })),
    C1_CATEGORIES,
  );

  const foreign = c2Rows.filter((r) => r.region === 'Foreign');
  const local = c2Rows.filter((r) => r.region === 'Local');
  const toRow = (r: C2Row, key: string) => ({
    fecha: r.fecha,
    key,
    value: Number(r.total_usd_mm) || 0,
  });

  const raKey = (s: string | null) =>
    (INFRA_STRATEGIES as readonly string[]).includes(s ?? '')
      ? 'Infrastructure'
      : (RE_STRATEGIES as readonly string[]).includes(s ?? '')
        ? 'Real Estate'
        : null;

  const localKey = (s: string | null): string => {
    if ((PE_STRATEGIES as readonly string[]).includes(s ?? ''))
      return 'Local Private Equity';
    if ((PD_STRATEGIES as readonly string[]).includes(s ?? ''))
      return 'Local Private Debt';
    if ((INFRA_STRATEGIES as readonly string[]).includes(s ?? ''))
      return 'Local Infrastructure';
    if (raKey(s) === 'Real Estate') return 'Local Real Estate';
    return 'Local Other Alternative';
  };

  return {
    byC1,
    foreignPE: pivotSeries(
      foreign.map((r) => toRow(r, r.alt_strategy ?? '')),
      PE_STRATEGIES,
    ),
    foreignPD: pivotSeries(
      foreign.map((r) => toRow(r, r.alt_strategy ?? '')),
      PD_STRATEGIES,
    ),
    foreignRA: pivotSeries(
      foreign
        .filter((r) => raKey(r.alt_strategy))
        .map((r) => toRow(r, raKey(r.alt_strategy)!)),
      RA_KEYS,
    ),
    local: pivotSeries(
      local.map((r) => toRow(r, localKey(r.alt_strategy))),
      LOCAL_KEYS,
    ),
  };
}
