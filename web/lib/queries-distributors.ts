import { supabase } from './supabase-server';
import type {
  DistributorMappingRow,
  DistributorSec09Row,
  UnmappedManagerRow,
} from './types-distributors';

export async function getDistributorMapping(): Promise<DistributorMappingRow[]> {
  const { data, error } = await supabase
    .from('dim_distributor_by_manager')
    .select('manager,distributor,is_ambiguous,notes,updated_at,updated_by')
    .order('manager', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    manager: r.manager as string,
    distributor: r.distributor as string,
    is_ambiguous: Boolean(r.is_ambiguous),
    notes: (r.notes as string | null) ?? null,
    updated_at: r.updated_at as string,
    updated_by: (r.updated_by as string | null) ?? null,
  }));
}

export async function getDistributorsSec09Dates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('v_distributors_sec09')
    .select('fecha_reporte')
    .gte('fecha_reporte', '2025-01-01')
    .order('fecha_reporte', { ascending: false })
    .limit(10000);
  if (error) throw error;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of data ?? []) {
    const f = r.fecha_reporte as string;
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out;
}

export async function getDistributorsSec09(
  fecha: string,
): Promise<DistributorSec09Row[]> {
  const { data, error } = await supabase
    .from('v_distributors_sec09')
    .select('fecha_reporte,distributor,manager,is_mapped,monto_usd_mm')
    .eq('fecha_reporte', fecha);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fecha_reporte: r.fecha_reporte as string,
    distributor: r.distributor as string,
    manager: r.manager as string,
    is_mapped: Boolean(r.is_mapped),
    monto_usd_mm: Number(r.monto_usd_mm) || 0,
  }));
}

// Resolve the four PDF Sec 09 baseline fechas given a "today" date:
//   - oneYearAgo: same month-end one year back
//   - lastYearEnd: Dec 31 of previous calendar year
//   - lastMonth:  last day of previous month
//   - today:      the input
// The view returns whatever dates exist; the caller falls back to the closest
// available if a baseline isn't present.
export function distributorBaselines(fecha: string): {
  oneYearAgo: string;
  lastYearEnd: string;
  lastMonth: string;
  today: string;
} {
  const [y, m] = fecha.split('-').map(Number);
  const lastDayOfMonth = (year: number, month1Indexed: number) =>
    new Date(Date.UTC(year, month1Indexed, 0)).toISOString().slice(0, 10);
  return {
    oneYearAgo: lastDayOfMonth(y - 1, m),
    lastYearEnd: `${y - 1}-12-31`,
    lastMonth: lastDayOfMonth(y, m - 1),
    today: fecha,
  };
}

export async function getDistributorsSec09Batch(
  fechas: string[],
): Promise<DistributorSec09Row[]> {
  const unique = Array.from(new Set(fechas));
  const { data, error } = await supabase
    .from('v_distributors_sec09')
    .select('fecha_reporte,distributor,manager,is_mapped,monto_usd_mm')
    .in('fecha_reporte', unique);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fecha_reporte: r.fecha_reporte as string,
    distributor: r.distributor as string,
    manager: r.manager as string,
    is_mapped: Boolean(r.is_mapped),
    monto_usd_mm: Number(r.monto_usd_mm) || 0,
  }));
}

// Managers with foreign AUM > 0 on the latest fecha that have no entry in
// dim_distributor_by_manager. Surfaces the cleanup queue for the admin UI.
export async function getUnmappedManagers(): Promise<UnmappedManagerRow[]> {
  const dates = await getDistributorsSec09Dates();
  if (dates.length === 0) return [];
  const latest = dates[0];
  const rows = await getDistributorsSec09(latest);
  const unmapped = rows.filter((r) => !r.is_mapped && r.distributor === 'Unmapped');
  const byManager = new Map<string, UnmappedManagerRow>();
  for (const r of unmapped) {
    const existing = byManager.get(r.manager);
    if (existing) {
      existing.monto_usd_mm += r.monto_usd_mm;
    } else {
      // funds count is not in the view; rough approximation = 1 since the
      // view is already aggregated by (fecha, distributor, manager). For an
      // accurate funds count we'd need a separate query against
      // v_foreign_by_fund_combined; not worth the round-trip for v1.
      byManager.set(r.manager, {
        manager: r.manager,
        funds: 1,
        monto_usd_mm: r.monto_usd_mm,
      });
    }
  }
  return Array.from(byManager.values()).sort(
    (a, b) => b.monto_usd_mm - a.monto_usd_mm,
  );
}
