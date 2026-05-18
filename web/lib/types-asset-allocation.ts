// Pure types and helpers safe to import from client components.

export const AFPS_AC = [
  'CAPITAL',
  'CUPRUM',
  'HABITAT',
  'MODELO',
  'PLANVITAL',
  'PROVIDA',
  'UNO',
] as const;
export type AfpAC = (typeof AFPS_AC)[number];

export const TIPO_FONDOS_AC = ['A', 'B', 'C', 'D', 'E'] as const;
export type TipoFondoAC = (typeof TIPO_FONDOS_AC)[number];

// PDF row order — matches Sec 02 / Sec 03 of the report. Total Derivatives
// and Total Other exist in the view but the PDF skips them; we do too.
export const AC_CATEGORIES = [
  'Local Equity',
  'Local Fixed Income',
  'Local Derivatives',
  'Local Other',
  'Total Local',
  'Foreign Equity',
  'Foreign Fixed Income',
  'Foreign Derivatives',
  'Foreign Other',
  'Total Foreign',
  'Total Equity',
  'Total Fixed Income',
  'Total Assets',
] as const;
export type AcCategory = (typeof AC_CATEGORIES)[number];

// Subtotal rows (rendered with a top border + bold).
export const AC_SUBTOTALS: ReadonlySet<AcCategory> = new Set([
  'Total Local',
  'Total Foreign',
  'Total Equity',
  'Total Fixed Income',
  'Total Assets',
]);

// OW/UW only makes sense for these (same as PDF page 1 bottom panel).
export const AC_OWUW_CATEGORIES = [
  'Local Equity',
  'Local Fixed Income',
  'Foreign Equity',
  'Foreign Fixed Income',
  'Total Local',
  'Total Foreign',
  'Total Equity',
  'Total Fixed Income',
] as const;
export type AcOwUwCategory = (typeof AC_OWUW_CATEGORIES)[number];

export type AssetClassByAfpRow = {
  afp: string;            // CAPITAL/.../UNO/TOTAL
  pdf_category: string;
  pdf_order: number;
  monto_dolares: number | null;   // USD MM
  porcentaje: number | null;       // 0..1 fraction of AFP total assets
};

export type AssetClassByTipoRow = {
  tipo_fondo: string;     // A/B/C/D/E/TOTAL
  pdf_category: string;
  pdf_order: number;
  monto_dolares: number | null;
  porcentaje: number | null;
};

// Sec 02 page 2 — Local Fixed Income breakdown (from CHIST + dim_tipo_instrumento_sp).
export const LOCAL_FI_BUCKETS = [
  'Central Bank',
  'Treasury',
  'Banks',
  'Corporates',
  'Fixed-term Deposit',
  'Other',
] as const;
export type LocalFiBucket = (typeof LOCAL_FI_BUCKETS)[number];

export type LocalFiRow = {
  afp: string;            // CAPITAL/.../UNO
  fecha_reporte: string;  // YYYY-MM-DD — single date per query (CHIST max)
  pdf_bucket: string;
  pdf_order: number;
  monto_usd_mm: number;
};

// Asset class evolution row — one per (fecha, tipo_fondo, pdf_category).
export type AssetClassEvolutionRow = {
  fecha: string;          // YYYY-MM-DD (fecha_valor from SP XML)
  tipo_fondo: string;     // A/B/C/D/E/TOTAL
  pdf_category: string;
  pdf_order: number;
  monto_dolares: number;  // USD MM
};

/**
 * Pivots an array (afp|tipo_fondo) × pdf_category into a row-per-category map:
 *   { category: { [colKey]: value } }.
 */
export function pivotByCategory<
  R extends { pdf_category: string },
  K extends keyof R,
>(
  rows: R[],
  colKey: K,
  valueKey: keyof R,
): Map<string, Record<string, number | null>> {
  const out = new Map<string, Record<string, number | null>>();
  for (const r of rows) {
    const cat = r.pdf_category;
    if (!out.has(cat)) out.set(cat, {});
    const v = r[valueKey];
    const c = String(r[colKey]);
    out.get(cat)![c] =
      v == null ? null : typeof v === 'number' ? v : Number(v);
  }
  return out;
}
