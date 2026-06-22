// Pure types for the module freshness / as-of layer (view v_module_freshness).
// Consumed by <AsOfBadge> to show each module's data vintage and lag status.
// Kept free of server-only imports so client components could read it too.

export type LagKind = 'fast' | 'sp_agg' | 'deliberate' | 'bbg' | 'ipd';

export type ModuleFreshness = {
  module_key: string;
  source_label: string;
  as_of_date: string; // ISO 'YYYY-MM-DD' — month-end of the underlying data
  published_date: string | null; // SP publication date when known (sp_fila.fecha_publicacion)
  lag_kind: LagKind;
  expected_lag_days: number;
  is_primary: boolean; // the defining source for the module (drives the page badge)
  is_behind: boolean; // as_of older than expected cadence → likely a load lag, not the SP design lag
};
