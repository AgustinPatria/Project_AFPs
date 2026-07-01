import { supabase } from './supabase-server';
import type {
  AssetClassByAfpRow,
  AssetClassByTipoRow,
  AssetClassEvolutionRow,
  AssetClassEvolutionByAfpRow,
  LocalFiRow,
} from './types-asset-allocation';

/**
 * Distinct fecha_valor across the asset-class views (one per published period).
 * Returned as YYYY-MM-DD strings, latest first.
 *
 * Reads from v_sp_asset_class_dates (DISTINCT fecha_valor over sp_fila cuadro
 * 1+2). Hitting v_sp_asset_class_afp directly hits PostgREST's server-side
 * max_rows=1000 cap before our .limit() takes effect: 624 rows/fecha would
 * silently cut us off after ~1.6 fechas.
 */
export async function getAssetAllocationDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('v_asset_class_dates_sd')
    .select('fecha_valor')
    .gte('fecha_valor', '2025-01-01')
    .order('fecha_valor', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.fecha_valor as string);
}

export async function getAssetClassByAfp(
  fecha: string,
): Promise<AssetClassByAfpRow[]> {
  // The view is afp × tipo_fondo × category. For Sec 02 cut by AFP we want
  // the all-funds (tipo_fondo='TOTAL') aggregate per AFP.
  const { data, error } = await supabase
    .from('v_asset_class_afp_sd')
    .select('afp_nombre,pdf_category,pdf_order,monto_dolares,porcentaje')
    .eq('fecha_valor', fecha)
    .eq('tipo_fondo', 'TOTAL');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    afp: r.afp_nombre as string,
    pdf_category: r.pdf_category as string,
    pdf_order: Number(r.pdf_order),
    monto_dolares: r.monto_dolares != null ? Number(r.monto_dolares) : null,
    // SP exposes porcentaje on a 0-100 scale; we normalize to 0..1 here so
    // formatters (fmtPct) can treat it like every other share in the app.
    porcentaje: r.porcentaje != null ? Number(r.porcentaje) / 100 : null,
  }));
}

export async function getAssetClassByTipo(
  fecha: string,
): Promise<AssetClassByTipoRow[]> {
  const { data, error } = await supabase
    .from('v_asset_class_tipo_sd')
    .select('tipo_fondo,pdf_category,pdf_order,monto_dolares,porcentaje')
    .eq('fecha_valor', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    tipo_fondo: r.tipo_fondo as string,
    pdf_category: r.pdf_category as string,
    pdf_order: Number(r.pdf_order),
    monto_dolares: r.monto_dolares != null ? Number(r.monto_dolares) : null,
    porcentaje: r.porcentaje != null ? Number(r.porcentaje) / 100 : null,
  }));
}

/**
 * Local Fixed Income breakdown by AFP × PDF bucket (Sec 02 page 2),
 * sourced from SP XML Cuadro 2 — same period as the main matrix, no lag.
 */
export async function getLocalFiByAfp(fecha: string): Promise<LocalFiRow[]> {
  const { data, error } = await supabase
    .from('v_local_fi_by_afp_sd')
    .select('afp,fecha_reporte,pdf_bucket,pdf_order,monto_usd_mm')
    .eq('fecha_reporte', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    afp: r.afp as string,
    fecha_reporte: r.fecha_reporte as string,
    pdf_bucket: r.pdf_bucket as string,
    pdf_order: Number(r.pdf_order),
    monto_usd_mm: Number(r.monto_usd_mm) || 0,
  }));
}

/**
 * Monthly evolution of asset class allocation per tipo_fondo (A-E + TOTAL).
 * Sourced from v_sp_asset_class_tipo (SP XML) — covers all months we've synced.
 * Returned ordered by fecha asc, then pdf_order asc.
 */
export async function getAssetClassEvolution(): Promise<
  AssetClassEvolutionRow[]
> {
  const rows: AssetClassEvolutionRow[] = [];
  // Supabase REST defaults to a 1000-row limit per query. With 15 months × 90
  // rows = 1,350 rows we'd be cut off, so we paginate.
  let offset = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('v_asset_class_tipo_sd')
      .select('fecha_valor,tipo_fondo,pdf_category,pdf_order,monto_dolares')
      .order('fecha_valor', { ascending: true })
      .order('pdf_order', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.monto_dolares == null) continue;
      rows.push({
        fecha: r.fecha_valor as string,
        tipo_fondo: r.tipo_fondo as string,
        pdf_category: r.pdf_category as string,
        pdf_order: Number(r.pdf_order),
        monto_dolares: Number(r.monto_dolares),
      });
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

/**
 * Monthly evolution of asset allocation per AFP (all-funds, tipo_fondo='TOTAL'),
 * including afp='TOTAL' = system. Feeds the AFP selector on the over-time chart.
 * Same pagination concern as getAssetClassEvolution (8 afps × ~13 cats × months).
 */
export async function getAssetClassEvolutionByAfp(): Promise<
  AssetClassEvolutionByAfpRow[]
> {
  const rows: AssetClassEvolutionByAfpRow[] = [];
  let offset = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('v_asset_class_afp_sd')
      .select('fecha_valor,afp_nombre,pdf_category,monto_dolares')
      .eq('tipo_fondo', 'TOTAL')
      .order('fecha_valor', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.monto_dolares == null) continue;
      rows.push({
        fecha: r.fecha_valor as string,
        afp: r.afp_nombre as string,
        pdf_category: r.pdf_category as string,
        monto_dolares: Number(r.monto_dolares),
      });
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

export type {
  AssetClassByAfpRow,
  AssetClassByTipoRow,
  AssetClassEvolutionRow,
  AssetClassEvolutionByAfpRow,
  LocalFiRow,
} from './types-asset-allocation';
export {
  AFPS_AC,
  TIPO_FONDOS_AC,
  AC_CATEGORIES,
  AC_OWUW_CATEGORIES,
  AC_SUBTOTALS,
  LOCAL_FI_BUCKETS,
  pivotByCategory,
} from './types-asset-allocation';
