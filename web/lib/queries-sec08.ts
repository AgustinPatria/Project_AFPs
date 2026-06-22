import { supabase } from './supabase-server';
import type { Sec08FlowRow } from './types-sec08';

export async function getSec08TopFlows(): Promise<Sec08FlowRow[]> {
  const { data, error } = await supabase
    .from('dim_sec08_top_flows')
    .select('fecha,period_type,direction,rk,fondo,amount_usd_mm')
    .order('fecha', { ascending: false })
    .order('period_type', { ascending: true })
    .order('direction', { ascending: true })
    .order('rk', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fecha: r.fecha as string,
    period_type: r.period_type as Sec08FlowRow['period_type'],
    direction: r.direction as Sec08FlowRow['direction'],
    rk: Number(r.rk) || 0,
    fondo: r.fondo as string,
    amount_usd_mm: Number(r.amount_usd_mm) || 0,
  }));
}
