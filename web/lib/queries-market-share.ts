import { supabase } from './supabase-server';
import type {
  AumRow,
  ContributorsRow,
  FlowsRow,
  ReturnsRow,
} from './types-market-share';

/**
 * Distinct dates in v_returns_afp_tipo (one per month, latest first).
 * Range covers 2020-01 to most recent month-end of valor_cuota_patrimonio.
 */
export async function getMarketShareDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('v_returns_afp_tipo')
    .select('fecha')
    .gte('fecha', '2025-01-01')
    .order('fecha', { ascending: false })
    // 7 AFPs × 6 tipo_fondo = 42 rows per fecha. 100 months × 42 = 4200.
    .limit(5000);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.fecha as string)));
}

export async function getAumByAfpTipo(fecha: string): Promise<AumRow[]> {
  const { data, error } = await supabase
    .from('v_returns_afp_tipo')
    .select('afp,tipo_fondo,aum_usd_mm,aum_clp_bn')
    .eq('fecha', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    afp: r.afp as string,
    tipo_fondo: r.tipo_fondo as string,
    aum_usd_mm: Number(r.aum_usd_mm) || 0,
    aum_clp_bn: Number(r.aum_clp_bn) || 0,
  }));
}

export async function getReturnsByAfpTipo(fecha: string): Promise<ReturnsRow[]> {
  const { data, error } = await supabase
    .from('v_returns_afp_tipo')
    .select(
      'afp,tipo_fondo,ret_mom_clp,ret_ytd_clp,ret_ltm_clp,ret_mom_usd,ret_ytd_usd,ret_ltm_usd',
    )
    .eq('fecha', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    afp: r.afp as string,
    tipo_fondo: r.tipo_fondo as string,
    ret_mom_clp: r.ret_mom_clp != null ? Number(r.ret_mom_clp) : null,
    ret_ytd_clp: r.ret_ytd_clp != null ? Number(r.ret_ytd_clp) : null,
    ret_ltm_clp: r.ret_ltm_clp != null ? Number(r.ret_ltm_clp) : null,
    ret_mom_usd: r.ret_mom_usd != null ? Number(r.ret_mom_usd) : null,
    ret_ytd_usd: r.ret_ytd_usd != null ? Number(r.ret_ytd_usd) : null,
    ret_ltm_usd: r.ret_ltm_usd != null ? Number(r.ret_ltm_usd) : null,
  }));
}

export async function getFlowsByAfpTipo(fecha: string): Promise<FlowsRow[]> {
  const { data, error } = await supabase
    .from('v_returns_afp_tipo')
    .select('afp,tipo_fondo,flow_mom_usd_mm,flow_ytd_usd_mm,flow_ltm_usd_mm')
    .eq('fecha', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    afp: r.afp as string,
    tipo_fondo: r.tipo_fondo as string,
    flow_mom_usd_mm:
      r.flow_mom_usd_mm != null ? Number(r.flow_mom_usd_mm) : null,
    flow_ytd_usd_mm:
      r.flow_ytd_usd_mm != null ? Number(r.flow_ytd_usd_mm) : null,
    flow_ltm_usd_mm:
      r.flow_ltm_usd_mm != null ? Number(r.flow_ltm_usd_mm) : null,
  }));
}

export async function getContributorsByAfp(
  fecha: string,
): Promise<ContributorsRow[]> {
  const { data, error } = await supabase
    .from('v_contributors_market_share')
    .select(
      'afp,fecha_cotizantes,aum_usd_mm,n_cotizantes,avg_usd_per_cotiz,share_aum,share_cotiz',
    )
    .eq('fecha_reporte', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    afp: r.afp as string,
    fecha_cotizantes: (r.fecha_cotizantes as string | null) ?? null,
    aum_usd_mm: Number(r.aum_usd_mm) || 0,
    n_cotizantes: r.n_cotizantes != null ? Number(r.n_cotizantes) : null,
    avg_usd_per_cotiz:
      r.avg_usd_per_cotiz != null ? Number(r.avg_usd_per_cotiz) : null,
    share_aum: r.share_aum != null ? Number(r.share_aum) : null,
    share_cotiz: r.share_cotiz != null ? Number(r.share_cotiz) : null,
  }));
}

// Re-export types and helper for convenience.
export type {
  AumRow,
  ContributorsRow,
  FlowsRow,
  ReturnsRow,
} from './types-market-share';
export {
  pivotByAfp,
  AFPS_RETURN,
  AFP_COLOR,
  TIPO_FONDOS,
} from './types-market-share';
export type { AfpReturn, TipoFondo } from './types-market-share';
