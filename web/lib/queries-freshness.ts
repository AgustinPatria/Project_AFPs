import { supabase } from './supabase-server';
import type { ModuleFreshness } from './types-freshness';

// All module/source freshness rows. Cached process-side for 60s so a page with
// a header badge + several card badges doesn't fire one round-trip per badge
// (same pattern as queries-data-sources). The underlying view computes is_behind
// against current_date at query time, so a few minutes of staleness is harmless.
let cached: { ts: number; rows: ModuleFreshness[] } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getAllModuleFreshness(): Promise<ModuleFreshness[]> {
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.rows;
  }
  const { data, error } = await supabase
    .from('v_module_freshness')
    .select(
      'module_key,source_label,as_of_date,published_date,lag_kind,expected_lag_days,is_primary,is_behind',
    );
  if (error) throw error;
  const rows = (data ?? []) as ModuleFreshness[];
  cached = { ts: Date.now(), rows };
  return rows;
}

// Returns the primary row (page badge) plus every source for a module (card badges).
export async function getModuleFreshness(moduleKey: string): Promise<{
  primary: ModuleFreshness | null;
  sources: ModuleFreshness[];
}> {
  const all = await getAllModuleFreshness();
  const sources = all.filter((r) => r.module_key === moduleKey);
  const primary = sources.find((r) => r.is_primary) ?? sources[0] ?? null;
  return { primary, sources };
}
