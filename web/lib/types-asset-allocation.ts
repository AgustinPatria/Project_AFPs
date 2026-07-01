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
// Order matches pdf_order in v_asset_class_afp_sd / v_asset_class_tipo_sd.
// Alternatives ('Activos Alternativos' from SP glosa) are carved out of Equity/
// Fixed Income into their own class per 1.3.
export const AC_CATEGORIES = [
  'Local Equity',
  'Local Fixed Income',
  'Local Derivatives',
  'Local Alternatives',
  'Local Other',
  'Total Local',
  'Foreign Equity',
  'Foreign Fixed Income',
  'Foreign Derivatives',
  'Foreign Alternatives',
  'Foreign Other',
  'Total Foreign',
  'Total Equity',
  'Total Fixed Income',
  'Total Alternatives',
  'Total Assets',
] as const;
export type AcCategory = (typeof AC_CATEGORIES)[number];

// Subtotal rows (rendered with a top border + bold).
export const AC_SUBTOTALS: ReadonlySet<AcCategory> = new Set([
  'Total Local',
  'Total Foreign',
  'Total Equity',
  'Total Fixed Income',
  'Total Alternatives',
  'Total Assets',
]);

// OW/UW vs system for every asset class, in the same order as the matrix above
// so the two tables line up row-for-row. 'Total Assets' is excluded: it is 100%
// of each AFP's own book by definition, so its active bet is always 0.
export const AC_OWUW_CATEGORIES: readonly AcCategory[] = AC_CATEGORIES.filter(
  (c) => c !== 'Total Assets',
);
export type AcOwUwCategory = AcCategory;

// 1.5 — asset-class-grouped layout for the distribution matrix. Each class shows its
// Local + Foreign rows and its subtotal; 'Other' bundles Derivatives + Other (no
// subtotal exists for it in the view). The geographic subtotals (Total Local / Total
// Foreign) are intentionally dropped — grouping is by asset class now. Total Assets is
// the highlighted grand total, rendered separately.
export const AC_GROUPS: ReadonlyArray<{
  label: string;
  rows: ReadonlyArray<{ cat: AcCategory; label: string }>;
  subtotal: AcCategory | null;
}> = [
  {
    label: 'Equities',
    rows: [
      { cat: 'Local Equity', label: 'Local' },
      { cat: 'Foreign Equity', label: 'Foreign' },
    ],
    subtotal: 'Total Equity',
  },
  {
    label: 'Fixed Income',
    rows: [
      { cat: 'Local Fixed Income', label: 'Local' },
      { cat: 'Foreign Fixed Income', label: 'Foreign' },
    ],
    subtotal: 'Total Fixed Income',
  },
  {
    label: 'Alternatives',
    rows: [
      { cat: 'Local Alternatives', label: 'Local' },
      { cat: 'Foreign Alternatives', label: 'Foreign' },
    ],
    subtotal: 'Total Alternatives',
  },
  {
    label: 'Other',
    rows: [
      { cat: 'Local Derivatives', label: 'Local Derivatives' },
      { cat: 'Foreign Derivatives', label: 'Foreign Derivatives' },
      { cat: 'Local Other', label: 'Local Other' },
      { cat: 'Foreign Other', label: 'Foreign Other' },
    ],
    subtotal: null,
  },
];
export const AC_GRAND_TOTAL: AcCategory = 'Total Assets';

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

// Same shape but cut by AFP (all-funds, tipo_fondo='TOTAL') instead of fund type.
// afp='TOTAL' is the system aggregate. Feeds the AFP selector on the
// "Asset Allocation Over Time" chart (1.6).
export type AssetClassEvolutionByAfpRow = {
  fecha: string;          // YYYY-MM-DD
  afp: string;            // CAPITAL/.../UNO/TOTAL
  pdf_category: string;
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
