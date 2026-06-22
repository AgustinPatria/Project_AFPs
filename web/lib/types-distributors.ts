// Pure types for the Distributors section (PDF Sec 09) and its admin mapping
// UI. Kept free of any 'server-only' imports so client components can pull
// types from here without breaking the build (see lib/types-foreign.ts for
// the same pattern).

export type DistributorMappingRow = {
  manager: string;
  distributor: string;
  is_ambiguous: boolean;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type DistributorFundOverrideRow = {
  fund_id: string;
  distributor: string;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

// Long-format row from v_distributors_sec09 — one per (fecha, distributor, manager).
export type DistributorSec09Row = {
  fecha_reporte: string;
  distributor: string;
  manager: string;
  is_mapped: boolean;
  monto_usd_mm: number;
};

// Unmapped manager seen in the latest foreign holdings, with the AUM at risk
// of being lost in the "Unmapped" bucket. Surfaced in the admin UI so the
// research desk can fix it.
export type UnmappedManagerRow = {
  manager: string;
  funds: number;
  monto_usd_mm: number;
};
