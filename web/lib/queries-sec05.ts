import { supabase } from './supabase-server';
import type {
  Sec05QuartileRow,
  Sec05IpsaMembershipRow,
  Sec05ConcentrationRow,
  Sec05Top40Row,
} from './types-sec05';

// Per-source resolved fechas for a given target. Used to render per-column
// dates in card headers so the user understands exactly what they're seeing.
export type Sec05ResolvedFechas = {
  pionero: string | null;
  mrv: string | null;
  ipsa: string | null;
  afps: string | null;
};

export async function getSec05ResolvedFechas(
  targetFecha: string,
): Promise<Sec05ResolvedFechas> {
  const [pionero, mrv, ipsa, afps] = await Promise.all([
    supabase
      .from('v_chilean_stocks_moneda_funds')
      .select('fecha_cartera')
      .eq('id_fund', 33)
      .lte('fecha_cartera', targetFecha)
      .order('fecha_cartera', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('v_chilean_stocks_moneda_funds')
      .select('fecha_cartera')
      .eq('id_fund', 19)
      .lte('fecha_cartera', targetFecha)
      .order('fecha_cartera', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('dim_ipsa_composition')
      .select('fecha')
      .lte('fecha', targetFecha)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('v_chilean_stocks_gics')
      .select('fecha_reporte')
      .lte('fecha_reporte', targetFecha)
      .order('fecha_reporte', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    pionero: (pionero.data?.fecha_cartera as string | undefined) ?? null,
    mrv: (mrv.data?.fecha_cartera as string | undefined) ?? null,
    ipsa: (ipsa.data?.fecha as string | undefined) ?? null,
    afps: (afps.data?.fecha_reporte as string | undefined) ?? null,
  };
}

export async function getSec05QuartileBreakdown(
  fecha: string,
): Promise<Sec05QuartileRow[]> {
  const { data, error } = await supabase.rpc('f_sec05_quartile', {
    p_fecha: fecha,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    cuartil: r.cuartil as Sec05QuartileRow['cuartil'],
    pionero_pct: Number(r.pionero_pct) || 0,
    mrv_pct: Number(r.mrv_pct) || 0,
    ipsa_pct: Number(r.ipsa_pct) || 0,
    afps_pct: Number(r.afps_pct) || 0,
  }));
}

export async function getSec05IpsaMembership(
  fecha: string,
): Promise<Sec05IpsaMembershipRow[]> {
  const { data, error } = await supabase.rpc('f_sec05_ipsa_membership', {
    p_fecha: fecha,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    bucket: r.bucket as Sec05IpsaMembershipRow['bucket'],
    pionero_pct: Number(r.pionero_pct) || 0,
    mrv_pct: Number(r.mrv_pct) || 0,
    ipsa_pct: Number(r.ipsa_pct) || 0,
    afps_pct: Number(r.afps_pct) || 0,
  }));
}

export async function getSec05Concentration(
  fecha: string,
): Promise<Sec05ConcentrationRow[]> {
  const { data, error } = await supabase.rpc('f_sec05_concentration', {
    p_fecha: fecha,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    metric: r.metric as Sec05ConcentrationRow['metric'],
    pionero: Number(r.pionero) || 0,
    mrv: Number(r.mrv) || 0,
    ipsa: Number(r.ipsa) || 0,
    afps: Number(r.afps) || 0,
  }));
}

export async function getSec05Top40(
  fecha: string,
): Promise<Sec05Top40Row[]> {
  const { data, error } = await supabase.rpc('f_sec05_top40', {
    p_fecha: fecha,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    rk: Number(r.rk) || 0,
    nemo: r.nemo as string,
    emisor: (r.emisor as string | null) ?? null,
    company_name: (r.company_name as string | null) ?? null,
    group_name: (r.group_name as string | null) ?? null,
    cuartil: (r.cuartil as Sec05Top40Row['cuartil']) ?? null,
    gics_name: (r.gics_name as string | null) ?? null,
    gics_chist: (r.gics_chist as string | null) ?? null,
    monto_usd_mm: Number(r.monto_usd_mm) || 0,
    weight: Number(r.weight) || 0,
  }));
}
