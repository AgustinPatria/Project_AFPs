import { supabase } from './supabase-server';

export type StrategyFamily = {
  family_id: number;
  family_name: string;
  family_short_name: string | null;
};

export type StrategyFundPoint = {
  fund_short_name: string;
  fondo_largo: string | null;
  manager: string | null;
  monto_usd_mm: number;
  market_share_pct: number;
};

export type StrategyTimePoint = {
  periodo: string;       // YYYY-MM
  fund_short_name: string;
  monto_usd_mm: number;
  market_share_pct: number;
};

export type StrategyDetail = {
  family: StrategyFamily;
  periodo: string;        // YYYY-MM (snapshot date)
  snapshot: StrategyFundPoint[]; // pie/table data, sorted by AUM desc
  timeSeries: StrategyTimePoint[]; // all periodos × funds for line charts
  totalUsdMm: number;
};

export async function getStrategyFamilies(): Promise<StrategyFamily[]> {
  // Pull from dim_bd_family directly (some families like 11 Local Equity DI/IF
  // have no comps and therefore don't appear in v_sp_strategy_aum).
  const { data, error } = await supabase
    .from('dim_bd_family')
    .select('family_id,family_name,family_short_name')
    .order('family_id');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    family_id: r.family_id as number,
    family_name: r.family_name as string,
    family_short_name: (r.family_short_name as string | null) ?? null,
  }));
}

export type LocalEquityPoint = {
  fecha_reporte: string;
  direct_clp_bn: number;
  // funds_clp_bn renders the new taxonomy by default (nt_asset_class='Equity'
  // AND nt_region='Chile'); funds_clp_bn_legacy keeps the old dim_bd_funds
  // membership. For the Chilean-equity-fund universe both coincide today.
  funds_clp_bn: number;
  funds_clp_bn_legacy: number;
  total_clp_bn: number;
  source: 'CHIST' | 'SP_XML';
};

export async function getLocalEquityDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('v_local_equity_di_vs_if_combined')
    .select('fecha_reporte')
    .order('fecha_reporte', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.fecha_reporte as string)));
}

export async function getLocalEquityHistory(): Promise<LocalEquityPoint[]> {
  const { data, error } = await supabase
    .from('v_local_equity_di_vs_if_combined')
    .select(
      'fecha_reporte,direct_clp_bn,funds_clp_bn,funds_clp_bn_nt,total_clp_bn,total_clp_bn_nt,source',
    )
    .order('fecha_reporte', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fecha_reporte: r.fecha_reporte as string,
    direct_clp_bn: Number(r.direct_clp_bn) || 0,
    funds_clp_bn: Number(r.funds_clp_bn_nt) || 0,
    funds_clp_bn_legacy: Number(r.funds_clp_bn) || 0,
    total_clp_bn: Number(r.total_clp_bn_nt) || 0,
    source: (r.source as 'CHIST' | 'SP_XML') ?? 'CHIST',
  }));
}

export async function getStrategyDates(family_id: number): Promise<string[]> {
  const { data, error } = await supabase
    .from('v_sp_strategy_aum')
    .select('periodo')
    .eq('family_id', family_id)
    .not('monto_dolares', 'is', null)
    .gte('periodo', '2025-01')
    .order('periodo', { ascending: false });
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.periodo as string)));
}

/**
 * @param rollupAfter If set, only the top-N funds (by AUM at `periodo`) are
 *  kept individually; everything else is collapsed into a single "Other" entry
 *  for both snapshot and time series. Matches the PDF page 9 "Top 10 HY"
 *  presentation.
 */
export async function getStrategyDetail(
  family_id: number,
  periodo: string,
  rollupAfter?: number,
): Promise<StrategyDetail | null> {
  const { data, error } = await supabase
    .from('v_sp_strategy_aum')
    .select(
      'family_id,family_name,family_short_name,fund_short_name,fondo_largo,manager,periodo,monto_dolares,market_share_pct',
    )
    .eq('family_id', family_id);
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const family: StrategyFamily = {
    family_id,
    family_name: data[0].family_name as string,
    family_short_name: (data[0].family_short_name as string | null) ?? null,
  };

  // Snapshot rows for the requested periodo (sorted by AUM desc).
  const snapshot: StrategyFundPoint[] = data
    .filter((r) => r.periodo === periodo && r.monto_dolares != null)
    .map((r) => ({
      fund_short_name: r.fund_short_name as string,
      fondo_largo: (r.fondo_largo as string | null) ?? null,
      manager: (r.manager as string | null) ?? null,
      monto_usd_mm: Number(r.monto_dolares) || 0,
      market_share_pct: Number(r.market_share_pct) || 0,
    }))
    .sort((a, b) => b.monto_usd_mm - a.monto_usd_mm);

  // Time series rows (all periodos with data for this family).
  const timeSeries: StrategyTimePoint[] = data
    .filter((r) => r.monto_dolares != null)
    .map((r) => ({
      periodo: r.periodo as string,
      fund_short_name: r.fund_short_name as string,
      monto_usd_mm: Number(r.monto_dolares) || 0,
      market_share_pct: Number(r.market_share_pct) || 0,
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  const totalUsdMm = snapshot.reduce((s, p) => s + p.monto_usd_mm, 0);

  // Optional top-N + Other rollup. Determines top funds from the snapshot;
  // funds not in top-N collapse to a single "Other" series across all periods.
  if (rollupAfter && snapshot.length > rollupAfter) {
    const topFunds = new Set(
      snapshot.slice(0, rollupAfter).map((p) => p.fund_short_name),
    );
    const otherSnapshot = snapshot.filter((p) => !topFunds.has(p.fund_short_name));
    const otherUsd = otherSnapshot.reduce((s, p) => s + p.monto_usd_mm, 0);
    const otherPct = otherSnapshot.reduce((s, p) => s + p.market_share_pct, 0);
    const newSnapshot: StrategyFundPoint[] = [
      ...snapshot.slice(0, rollupAfter),
      {
        fund_short_name: 'Other',
        fondo_largo: `Other (${otherSnapshot.length} funds combined)`,
        manager: null,
        monto_usd_mm: otherUsd,
        market_share_pct: otherPct,
      },
    ];
    // Time series: keep top funds individually, sum the rest into "Other" per periodo.
    const tsByPeriodo = new Map<string, { top: StrategyTimePoint[]; other: { usd: number; pct: number } }>();
    for (const r of timeSeries) {
      let bucket = tsByPeriodo.get(r.periodo);
      if (!bucket) {
        bucket = { top: [], other: { usd: 0, pct: 0 } };
        tsByPeriodo.set(r.periodo, bucket);
      }
      if (topFunds.has(r.fund_short_name)) {
        bucket.top.push(r);
      } else {
        bucket.other.usd += r.monto_usd_mm;
        bucket.other.pct += r.market_share_pct;
      }
    }
    const newTimeSeries: StrategyTimePoint[] = [];
    for (const [periodoKey, bucket] of tsByPeriodo) {
      newTimeSeries.push(...bucket.top);
      if (bucket.other.usd > 0 || bucket.other.pct > 0) {
        newTimeSeries.push({
          periodo: periodoKey,
          fund_short_name: 'Other',
          monto_usd_mm: bucket.other.usd,
          market_share_pct: bucket.other.pct,
        });
      }
    }
    newTimeSeries.sort((a, b) => a.periodo.localeCompare(b.periodo));
    return {
      family,
      periodo,
      snapshot: newSnapshot,
      timeSeries: newTimeSeries,
      totalUsdMm,
    };
  }

  return { family, periodo, snapshot, timeSeries, totalUsdMm };
}
