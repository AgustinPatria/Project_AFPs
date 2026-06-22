import { supabase } from './supabase-server';
import {
  AFPS,
  C1_CATEGORIES,
  type AfpC1Row,
  type AfpName,
  type C1Name,
  type EvolutionPoint,
  type OverviewRow,
} from './dimensions';

export async function getAvailableDates(limit = 60): Promise<string[]> {
  // v_total = cartera (CHIST) dates, the binding constraint — v_aum reaches
  // further back/forward but NAV/Uncalled only exist where carteras do.
  const { data, error } = await supabase
    .from('v_total')
    .select('fecha')
    .gte('fecha', '2025-01-01')
    .order('fecha', { ascending: false })
    .limit(limit * AFPS.length);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.fecha as string)));
}

export async function getOverview(fecha: string): Promise<OverviewRow[]> {
  const [aumRes, navRes, uncRes, totRes] = await Promise.all([
    supabase.from('v_aum').select('afp,aum_usd_mm').eq('fecha', fecha),
    supabase.from('v_nav').select('afp,nav_usd_mm').eq('fecha', fecha),
    supabase.from('v_uncalled').select('afp,uncalled_usd_mm').eq('fecha', fecha),
    supabase.from('v_total').select('afp,total_usd_mm').eq('fecha', fecha),
  ]);
  for (const r of [aumRes, navRes, uncRes, totRes]) {
    if (r.error) throw r.error;
  }
  const map = new Map<string, OverviewRow>();
  const ensure = (afp: string) => {
    let row = map.get(afp);
    if (!row) {
      row = { afp, aum: 0, nav: 0, uncalled: 0, total: 0 };
      map.set(afp, row);
    }
    return row;
  };
  for (const r of aumRes.data ?? []) ensure(r.afp).aum = Number(r.aum_usd_mm) || 0;
  for (const r of navRes.data ?? []) ensure(r.afp).nav = Number(r.nav_usd_mm) || 0;
  for (const r of uncRes.data ?? []) ensure(r.afp).uncalled = Number(r.uncalled_usd_mm) || 0;
  for (const r of totRes.data ?? []) ensure(r.afp).total = Number(r.total_usd_mm) || 0;

  return [...map.values()]
    .filter((r) => r.aum + r.nav + r.uncalled + r.total > 0)
    .sort((a, b) => b.total - a.total);
}

export async function getNavByAfpC1(fecha: string): Promise<AfpC1Row[]> {
  const { data, error } = await supabase
    .from('v_afp_c1')
    .select('afp,c1,total_usd_mm')
    .eq('fecha', fecha);
  if (error) throw error;

  const afpSet = new Set<string>(AFPS);
  const byAfp = new Map<string, AfpC1Row>();
  for (const r of data ?? []) {
    const afp = r.afp as string;
    if (!afpSet.has(afp)) continue;
    if (!byAfp.has(afp)) {
      const empty: AfpC1Row = { afp } as AfpC1Row;
      for (const c of C1_CATEGORIES) empty[c] = 0;
      byAfp.set(afp, empty);
    }
    if ((C1_CATEGORIES as readonly string[]).includes(r.c1 as string)) {
      byAfp.get(afp)![r.c1 as C1Name] = Number(r.total_usd_mm) || 0;
    }
  }
  return [...byAfp.values()]
    .filter((row) => C1_CATEGORIES.some((c) => row[c] > 0))
    .sort((a, b) => AFPS.indexOf(a.afp as AfpName) - AFPS.indexOf(b.afp as AfpName));
}

export async function getEvolution(): Promise<{
  totals: EvolutionPoint[];
  aums: EvolutionPoint[];
}> {
  const [totalRes, aumRes] = await Promise.all([
    supabase
      .from('v_total')
      .select('fecha,afp,total_usd_mm')
      .order('fecha', { ascending: true }),
    supabase
      .from('v_aum')
      .select('fecha,afp,aum_usd_mm')
      .order('fecha', { ascending: true }),
  ]);
  if (totalRes.error) throw totalRes.error;
  if (aumRes.error) throw aumRes.error;

  const afpSet = new Set<string>(AFPS);

  function pivot(
    rows: { fecha: string; afp: string; value: number }[],
  ): EvolutionPoint[] {
    const byFecha = new Map<string, EvolutionPoint>();
    for (const r of rows) {
      if (!afpSet.has(r.afp)) continue;
      if (!byFecha.has(r.fecha)) byFecha.set(r.fecha, { fecha: r.fecha });
      byFecha.get(r.fecha)![r.afp as AfpName] = r.value || 0;
    }
    return [...byFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  return {
    totals: pivot(
      (totalRes.data ?? []).map((r) => ({
        fecha: r.fecha as string,
        afp: r.afp as string,
        value: Number(r.total_usd_mm) || 0,
      })),
    ),
    aums: pivot(
      (aumRes.data ?? []).map((r) => ({
        fecha: r.fecha as string,
        afp: r.afp as string,
        value: Number(r.aum_usd_mm) || 0,
      })),
    ),
  };
}
