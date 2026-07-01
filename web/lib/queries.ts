import { supabase } from './supabase-server';
import {
  AFPS,
  C1_CATEGORIES,
  type AfpC1Row,
  type AfpName,
  type C1Name,
  type EvolutionPoint,
  type MultifondoRow,
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

// Per-multifondo (A–E) breakdown for every AFP, keyed by AFP name. Powers the
// expandable Summary AFP rows. NAV/Uncalled/Total come from v_afp_multifondo
// (aggregates mv_chist_aa to ~40 rows/date). AUM by multifondo isn't in that
// view, so it's derived here from valores_cuota_patrimonio + the date's FX rate
// (CLFXDOOB_sindesf), mirroring how mv_aum computes AFP-level AUM.
export async function getOverviewDetail(
  fecha: string,
): Promise<Record<string, MultifondoRow[]>> {
  const [mfRes, fxRes, patRes] = await Promise.all([
    supabase
      .from('v_afp_multifondo')
      .select('afp,tipo_de_fondo,nav_usd_mm,uncalled_usd_mm,total_usd_mm')
      .eq('fecha', fecha),
    supabase
      .from('tipo_cambio')
      .select('valor')
      .eq('fecha', fecha)
      .eq('instrumento_codigo', 'CLFXDOOB_sindesf')
      .maybeSingle(),
    supabase
      .from('valores_cuota_patrimonio')
      .select('afp,multifondo,valor_patrimonio')
      .eq('fecha', fecha),
  ]);
  for (const r of [mfRes, fxRes, patRes]) {
    if (r.error) throw r.error;
  }

  const fx = Number(fxRes.data?.valor) || 0;

  // AUM (USD MM) per afp+multifondo from the cuota/patrimonio table.
  const aumByKey = new Map<string, number>();
  if (fx > 0) {
    for (const r of patRes.data ?? []) {
      const key = `${r.afp}|${r.multifondo}`;
      const aum = (Number(r.valor_patrimonio) || 0) / fx / 1_000_000;
      aumByKey.set(key, (aumByKey.get(key) ?? 0) + aum);
    }
  }

  const byAfp: Record<string, MultifondoRow[]> = {};
  for (const r of mfRes.data ?? []) {
    const afp = r.afp as string;
    const mf = r.tipo_de_fondo as string;
    (byAfp[afp] ??= []).push({
      multifondo: mf,
      nav: Number(r.nav_usd_mm) || 0,
      uncalled: Number(r.uncalled_usd_mm) || 0,
      total: Number(r.total_usd_mm) || 0,
      aum: aumByKey.get(`${afp}|${mf}`) ?? 0,
    });
  }
  for (const rows of Object.values(byAfp)) {
    rows.sort((a, b) => a.multifondo.localeCompare(b.multifondo));
  }
  return byAfp;
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
