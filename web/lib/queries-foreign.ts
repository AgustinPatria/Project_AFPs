import { supabase } from './supabase-server';
import type { ForeignSource, ForeignSummaryRow } from './types-foreign';

/**
 * Distinct fecha_reporte in v_foreign_pdf_summary_combined (latest first),
 * paired with the source that owns each fecha (CHIST or SP_XML).
 */
export async function getForeignDates(): Promise<
  { fecha: string; source: ForeignSource }[]
> {
  const { data, error } = await supabase
    .from('v_foreign_pdf_summary_combined')
    .select('fecha_reporte,source')
    .order('fecha_reporte', { ascending: false })
    // ~45-53 rows per fecha; 80 months ≈ 4,000 rows. 5,000 leaves headroom.
    .limit(5000);
  if (error) throw error;
  const seen = new Set<string>();
  const out: { fecha: string; source: ForeignSource }[] = [];
  for (const r of data ?? []) {
    const fecha = r.fecha_reporte as string;
    if (seen.has(fecha)) continue;
    seen.add(fecha);
    out.push({ fecha, source: (r.source as ForeignSource) ?? 'CHIST' });
  }
  return out;
}

/**
 * Aggregated foreign breakdown for a single fecha_reporte.
 */
export async function getForeignSummary(
  fecha: string,
): Promise<ForeignSummaryRow[]> {
  const { data, error } = await supabase
    .from('v_foreign_pdf_summary_combined')
    .select('fecha_reporte,pdf_bucket,pdf_em_dm,pdf_subregion,pdf_fi_category,monto_usd_mm,source')
    .eq('fecha_reporte', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fecha_reporte: r.fecha_reporte as string,
    pdf_bucket: r.pdf_bucket as string,
    pdf_em_dm: (r.pdf_em_dm as string | null) ?? null,
    pdf_subregion: (r.pdf_subregion as string | null) ?? null,
    pdf_fi_category: (r.pdf_fi_category as string | null) ?? null,
    monto_usd_mm: Number(r.monto_usd_mm) || 0,
    source: (r.source as ForeignSource) ?? 'CHIST',
  }));
}

/**
 * Returns the four baseline fechas used by the Changes view, matching the SP
 * convention (month-end = last day of month). Computed via UTC Date math:
 * `new Date(Date.UTC(y, monthIndex, 0))` gives the last day of `monthIndex - 1`.
 *
 * For 2026-03-31:
 *   { mom: '2026-02-28', ytd: '2025-12-31', ltm: '2025-03-31', threeY: '2023-03-31' }
 */
function priorBaselines(fecha: string): {
  mom: string;
  ytd: string;
  ltm: string;
  threeY: string;
} {
  const [y, m] = fecha.split('-').map(Number);
  const lastDayOfMonth = (year: number, month1Indexed: number) =>
    new Date(Date.UTC(year, month1Indexed, 0)).toISOString().slice(0, 10);
  return {
    mom: lastDayOfMonth(y, m - 1),    // last day of prior month
    ytd: `${y - 1}-12-31`,            // Dec of prior calendar year
    ltm: lastDayOfMonth(y - 1, m),    // same month-end, 12m back
    threeY: lastDayOfMonth(y - 3, m), // same month-end, 36m back
  };
}

/**
 * Pull start (MoM, YTD, LTM, 3Y) and end (current) foreign breakdowns in a
 * single round-trip. Caller is responsible for checking which baselines actually
 * exist in the dataset (compare against getForeignDates) — this just returns
 * empty arrays for baselines we don't have data for, which would otherwise
 * collapse to "all positive change" silently.
 */
export async function getForeignChanges(fecha: string): Promise<{
  fechaEnd: string;
  fechaMomStart: string;
  fechaYtdStart: string;
  fechaLtmStart: string;
  fechaThreeYStart: string;
  endRows: ForeignSummaryRow[];
  momStartRows: ForeignSummaryRow[];
  ytdStartRows: ForeignSummaryRow[];
  ltmStartRows: ForeignSummaryRow[];
  threeYStartRows: ForeignSummaryRow[];
}> {
  const { mom, ytd, ltm, threeY } = priorBaselines(fecha);
  const [endRows, momStartRows, ytdStartRows, ltmStartRows, threeYStartRows] =
    await Promise.all([
      getForeignSummary(fecha),
      getForeignSummary(mom),
      getForeignSummary(ytd),
      getForeignSummary(ltm),
      getForeignSummary(threeY),
    ]);
  return {
    fechaEnd: fecha,
    fechaMomStart: mom,
    fechaYtdStart: ytd,
    fechaLtmStart: ltm,
    fechaThreeYStart: threeY,
    endRows,
    momStartRows,
    ytdStartRows,
    ltmStartRows,
    threeYStartRows,
  };
}

/**
 * Per-fund total USD MM as of one fecha. Used by Top Net Flows (sec 08).
 */
export type ForeignFundRow = {
  fund_id: string;
  fondo: string;
  manager: string | null;
  monto_usd_mm: number;
};

export type FundDeltaRow = {
  fund_id: string;
  fondo: string;
  manager: string | null;
  delta_usd_mm: number;
};

// PDF Sec 08 methodology — pure transaction flow per fund using
//   flow_clp_nemo = inv_curr − inv_prev × (price_curr / price_prev)
// aggregated to fund_id, then converted via end-period FX. Same approach as
// Chilean Stocks Sec 06 fix; only CHIST fechas (mv_chist_foreign_units_by_nemo).
type ForeignNemoSnap = {
  fund_id: string;
  fondo: string;
  manager: string | null;
  nemo: string;
  inv_clp: number;
  price_clp: number;
};

async function getForeignNemoSnapshot(fecha: string): Promise<ForeignNemoSnap[]> {
  // ~17K rows / fecha so we paginate around the PostgREST 1000-row cap.
  const out: ForeignNemoSnap[] = [];
  const PAGE = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('mv_chist_foreign_units_by_nemo')
      .select('fund_id,fondo,manager,nemo,inv_clp,price_clp')
      .eq('fecha_reporte', fecha)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<{
      fund_id: string;
      fondo: string;
      manager: string | null;
      nemo: string;
      inv_clp: number | string | null;
      price_clp: number | string | null;
    }>;
    for (const r of batch) {
      out.push({
        fund_id: String(r.fund_id),
        fondo: r.fondo,
        manager: r.manager ?? null,
        nemo: r.nemo,
        inv_clp: Number(r.inv_clp) || 0,
        price_clp: Number(r.price_clp) || 0,
      });
    }
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function getFxClpPerUsdForeign(fecha: string): Promise<number> {
  const { data, error } = await supabase
    .from('tipo_cambio')
    .select('valor')
    .eq('fecha', fecha)
    .eq('instrumento_codigo', 'USDCLP Curncy')
    .limit(1);
  if (error) throw error;
  return Number(data?.[0]?.valor) || 0;
}

/**
 * Aggregate per-nemo flows up to fund level using
 *   flow_clp = inv_curr − inv_prev × (price_curr / price_prev)
 * Returns top N inflows + top N outflows in USD MM.
 */
function computeFundFlows(
  end: ForeignNemoSnap[],
  start: ForeignNemoSnap[],
  fxCurr: number,
  topN: number,
): { inflows: FundDeltaRow[]; outflows: FundDeltaRow[] } {
  // Match per-nemo within fund_id.
  const key = (fund_id: string, nemo: string) => `${fund_id}|${nemo}`;
  const startByKey = new Map(start.map((s) => [key(s.fund_id, s.nemo), s]));
  const flowsByFund = new Map<
    string,
    { fondo: string; manager: string | null; flow_clp: number }
  >();
  const seen = new Set<string>();
  for (const c of end) {
    const k = key(c.fund_id, c.nemo);
    seen.add(k);
    const p = startByKey.get(k);
    let flowClp: number;
    if (!p) {
      flowClp = c.inv_clp;
    } else if (!p.price_clp) {
      flowClp = c.inv_clp - p.inv_clp;
    } else {
      flowClp = c.inv_clp - p.inv_clp * (c.price_clp / p.price_clp);
    }
    const cur = flowsByFund.get(c.fund_id);
    if (cur) cur.flow_clp += flowClp;
    else flowsByFund.set(c.fund_id, { fondo: c.fondo, manager: c.manager, flow_clp: flowClp });
  }
  // Positions present at start but not end (closed).
  for (const p of start) {
    const k = key(p.fund_id, p.nemo);
    if (seen.has(k)) continue;
    const cur = flowsByFund.get(p.fund_id);
    if (cur) cur.flow_clp -= p.inv_clp;
    else flowsByFund.set(p.fund_id, { fondo: p.fondo, manager: p.manager, flow_clp: -p.inv_clp });
  }
  const fxScale = fxCurr * 1e6;
  const deltas: FundDeltaRow[] = [];
  for (const [fund_id, agg] of flowsByFund) {
    const usd = fxScale > 0 ? agg.flow_clp / fxScale : 0;
    deltas.push({ fund_id, fondo: agg.fondo, manager: agg.manager, delta_usd_mm: usd });
  }
  deltas.sort((a, b) => b.delta_usd_mm - a.delta_usd_mm);
  return {
    inflows: deltas.filter((d) => d.delta_usd_mm > 0).slice(0, topN),
    outflows: deltas.filter((d) => d.delta_usd_mm < 0).slice(-topN).reverse(),
  };
}

/**
 * Top N inflows and outflows per fund for the MoM and YTD windows ending at
 * `fecha`. Uses the units-based PDF Sec 08 methodology. Returns empty buckets
 * for fechas outside CHIST coverage (SP XML window).
 */
export async function getForeignTopFlows(
  fecha: string,
  topN = 10,
): Promise<{
  fechaEnd: string;
  fechaMomStart: string;
  fechaYtdStart: string;
  mom: { inflows: FundDeltaRow[]; outflows: FundDeltaRow[] };
  ytd: { inflows: FundDeltaRow[]; outflows: FundDeltaRow[] };
}> {
  const { mom, ytd } = priorBaselines(fecha);
  const [end, momStart, ytdStart, fxCurr] = await Promise.all([
    getForeignNemoSnapshot(fecha),
    getForeignNemoSnapshot(mom),
    getForeignNemoSnapshot(ytd),
    getFxClpPerUsdForeign(fecha),
  ]);
  const empty = { inflows: [] as FundDeltaRow[], outflows: [] as FundDeltaRow[] };
  return {
    fechaEnd: fecha,
    fechaMomStart: mom,
    fechaYtdStart: ytd,
    mom: end.length && momStart.length ? computeFundFlows(end, momStart, fxCurr, topN) : empty,
    ytd: end.length && ytdStart.length ? computeFundFlows(end, ytdStart, fxCurr, topN) : empty,
  };
}

/**
 * Per (manager, asset_class, em_dm/region/category, fund_style) row at one fecha.
 * Used by Sec 10 (Managers).
 */
export type ManagerRow = {
  manager: string;
  fund_style: 'Active' | 'Passive';
  asset_class: string | null;
  category: string | null;
  region: string | null;
  monto_usd_mm: number;
};

// Manager-name aliases applied at read time so the dashboard groups sub-brands
// the same way the PDF does. dim_bd_funds keeps the underlying brand intact;
// only the aggregated view re-labels them.
const MANAGER_ALIASES: Record<string, string> = {
  'x-trackers': 'Deutsche',     // DWS ETF brand; PDF Sec 10 reports under Deutsche.
};

export async function getForeignManagers(fecha: string): Promise<ManagerRow[]> {
  const { data, error } = await supabase
    .from('v_foreign_managers_combined')
    .select('manager,fund_style,asset_class,category,region,monto_usd_mm')
    .eq('fecha_reporte', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const rawManager = (r.manager as string) ?? 'Unknown';
    return {
      manager: MANAGER_ALIASES[rawManager] ?? rawManager,
      fund_style: (r.fund_style as 'Active' | 'Passive') ?? 'Active',
      asset_class: (r.asset_class as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      region: (r.region as string | null) ?? null,
      monto_usd_mm: Number(r.monto_usd_mm) || 0,
    };
  });
}

// ============================================================================
// Foreign Investment evolution (Total Foreign + buckets) over all fechas
// ============================================================================

export type ForeignEvolutionPoint = {
  fecha_reporte: string;
  equity: number;
  fixed_income: number;
  private_equity: number;
  direct_investment: number;
  other: number;
  total: number;
};

/**
 * One row per fecha with USD MM aggregated by bucket. Uses the combined
 * CHIST + SP XML view, so it spans CHIST historical + SP XML recent fechas.
 */
export async function getForeignEvolution(): Promise<ForeignEvolutionPoint[]> {
  const { data, error } = await supabase
    .from('v_foreign_pdf_summary_combined')
    .select('fecha_reporte,pdf_bucket,monto_usd_mm')
    .order('fecha_reporte', { ascending: true })
    .limit(20000);
  if (error) throw error;
  const byFecha = new Map<string, ForeignEvolutionPoint>();
  for (const r of data ?? []) {
    const fecha = r.fecha_reporte as string;
    const bucket = r.pdf_bucket as string;
    const usd = Number(r.monto_usd_mm) || 0;
    let p = byFecha.get(fecha);
    if (!p) {
      p = {
        fecha_reporte: fecha,
        equity: 0,
        fixed_income: 0,
        private_equity: 0,
        direct_investment: 0,
        other: 0,
        total: 0,
      };
      byFecha.set(fecha, p);
    }
    if (bucket === 'Equity') p.equity += usd;
    else if (bucket === 'Fixed Income') p.fixed_income += usd;
    else if (bucket === 'Private Equity') p.private_equity += usd;
    else if (bucket === 'Direct Investment') p.direct_investment += usd;
    else p.other += usd;
    p.total += usd;
  }
  return Array.from(byFecha.values()).sort((a, b) =>
    a.fecha_reporte.localeCompare(b.fecha_reporte),
  );
}

export type { ForeignSummaryRow } from './types-foreign';
export {
  buildPdfTree,
  TOP_BUCKET_ORDER,
  FI_SUBREGION_ORDER,
  EQUITY_SUBREGION_ORDER,
  FI_CATEGORY_ORDER,
} from './types-foreign';
