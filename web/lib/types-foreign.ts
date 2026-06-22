// Pure types and helpers safe to import from client components.

export type ForeignSource = 'CHIST' | 'SP_XML';

// Which fund taxonomy drives the foreign buckets. 'nt' = new taxonomy
// (BD_Funds) and is the default; 'legacy' reproduces the dim_bd_funds buckets
// used by the PDF Sec 07.
export type ForeignTaxonomy = 'legacy' | 'nt';

export type ForeignSummaryRow = {
  fecha_reporte: string;        // YYYY-MM-DD
  pdf_bucket: string;            // Equity | Fixed Income | Private Equity | Other | Direct Investment | Unknown
  pdf_em_dm: string | null;      // Emerging Markets | Developed Markets | (null for non-EM/DM rows)
  pdf_subregion: string | null;
  pdf_fi_category: string | null;
  monto_usd_mm: number;
  source: ForeignSource;
};

// Return/Flow split over a Changes window (PDF Sec 07 pages 4-5 methodology).
// returnRows/flowRows reuse the summary-row shape with monto_usd_mm carrying
// the window-aggregated return (or flow) so buildPdfTree can aggregate them.
export type ForeignSplit = {
  /** Month-ends inside the window that have split data. */
  covered: string[];
  /** Month-ends inside the window without split data (e.g. Jan-25 or CHIST era). */
  missing: string[];
  returnRows: ForeignSummaryRow[];
  flowRows: ForeignSummaryRow[];
};

// PDF Sec 07 row order — matches the layout of page 2 of the foreign report.
export const FI_SUBREGION_ORDER: Record<string, string[]> = {
  'Emerging Markets': ['GEM', 'Latam', 'Asia Pacific'],
  'Developed Markets': ['Global', 'North America', 'Europe'],
};

export const EQUITY_SUBREGION_ORDER: Record<string, string[]> = {
  'Emerging Markets': ['Asia Pacific ex Japan', 'Emerging Europe', 'GEM', 'Latam'],
  'Developed Markets': ['Europe', 'Japan', 'North America', 'Global'],
};

export const FI_CATEGORY_ORDER = [
  'Investment Grade',
  'High Yield',
  'Mixed',
  'Local Currency',
  'Convertible',
  'Money Market',
  'Mortgage Backed',
  'Bank Loans',
  'Short Term',
  'Inflation Linked',
  'Total Return',
] as const;

export const TOP_BUCKET_ORDER = [
  'Fixed Income',
  'Equity',
  'Private Equity',
  'Direct Investment',
  'Unknown',
] as const;

// Hierarchical row used by the rendered table. `level` controls indent.
export type DisplayRow = {
  key: string;             // unique id
  level: 0 | 1 | 2 | 3;
  label: string;
  usd: number;
  // % of Total Foreign Investment
  pct_foreign: number;
  // % of Asset Class (Total FI for FI rows, Total Equity for Equity rows;
  // null for top-level standalone buckets like PE/Other/Direct)
  pct_asset_class: number | null;
  isSubtotal: boolean;
};

/**
 * Build the hierarchical PDF row list from raw summary rows. Always returns
 * the full PDF tree shape (FI > EM/DM > subregion > fi_category, then Equity
 * > EM/DM > subregion, then PE/Other/Direct/Unknown/Total) — empty cells
 * render as 0.
 */
export function buildPdfTree(rows: ForeignSummaryRow[]): DisplayRow[] {
  // Index for quick lookup.
  const lookup = new Map<string, number>();
  let totalForeign = 0;
  for (const r of rows) {
    const key = [
      r.pdf_bucket,
      r.pdf_em_dm ?? '',
      r.pdf_subregion ?? '',
      r.pdf_fi_category ?? '',
    ].join('|');
    lookup.set(key, (lookup.get(key) ?? 0) + r.monto_usd_mm);
    totalForeign += r.monto_usd_mm;
  }

  const sumByBucket: Record<string, number> = {};
  const sumByBucketEmDm: Record<string, number> = {};
  const sumByBucketEmDmSubregion: Record<string, number> = {};
  // Subregions / FI categories actually present, so the new taxonomy can surface
  // values outside the fixed PDF order (e.g. Brazil, RoW, nt sub-categories).
  const presentSub: Record<string, Set<string>> = {};
  const presentCat: Record<string, Set<string>> = {};
  for (const r of rows) {
    const b = r.pdf_bucket;
    const em = r.pdf_em_dm ?? '';
    const sr = r.pdf_subregion ?? '';
    const cat = r.pdf_fi_category ?? '';
    sumByBucket[b] = (sumByBucket[b] ?? 0) + r.monto_usd_mm;
    if (em) sumByBucketEmDm[`${b}|${em}`] = (sumByBucketEmDm[`${b}|${em}`] ?? 0) + r.monto_usd_mm;
    if (em && sr) {
      const k = `${b}|${em}|${sr}`;
      sumByBucketEmDmSubregion[k] = (sumByBucketEmDmSubregion[k] ?? 0) + r.monto_usd_mm;
      (presentSub[`${b}|${em}`] ??= new Set()).add(sr);
      if (cat) (presentCat[k] ??= new Set()).add(cat);
    }
  }

  // Known PDF order first (always shown, preserves the legacy layout), then any
  // extra present values appended by descending USD.
  const orderedSub = (b: string, em: string, known: readonly string[]): string[] => {
    const present = presentSub[`${b}|${em}`] ?? new Set<string>();
    const extra = [...present]
      .filter((s) => !known.includes(s))
      .sort(
        (a, c) =>
          (sumByBucketEmDmSubregion[`${b}|${em}|${c}`] ?? 0) -
          (sumByBucketEmDmSubregion[`${b}|${em}|${a}`] ?? 0),
      );
    return [...known, ...extra];
  };
  const orderedCat = (b: string, em: string, sr: string): string[] => {
    const present = presentCat[`${b}|${em}|${sr}`] ?? new Set<string>();
    const extra = [...present]
      .filter((c) => !(FI_CATEGORY_ORDER as readonly string[]).includes(c))
      .sort(
        (a, c) =>
          (lookup.get(`${b}|${em}|${sr}|${c}`) ?? 0) -
          (lookup.get(`${b}|${em}|${sr}|${a}`) ?? 0),
      );
    return [...FI_CATEGORY_ORDER, ...extra];
  };

  const out: DisplayRow[] = [];
  const totalFi = sumByBucket['Fixed Income'] ?? 0;
  const totalEquity = sumByBucket['Equity'] ?? 0;
  const pctFor = (v: number) =>
    totalForeign > 0 ? v / totalForeign : 0;

  // ---------- Fixed Income ----------
  for (const em of ['Emerging Markets', 'Developed Markets'] as const) {
    if (em === 'Emerging Markets') {
      out.push({
        key: `fi-header`,
        level: 0,
        label: 'Fixed Income',
        usd: totalFi,
        pct_foreign: pctFor(totalFi),
        pct_asset_class: 1,
        isSubtotal: true,
      });
    }
    const emTotal = sumByBucketEmDm[`Fixed Income|${em}`] ?? 0;
    out.push({
      key: `fi-${em}`,
      level: 1,
      label: em,
      usd: emTotal,
      pct_foreign: pctFor(emTotal),
      pct_asset_class: totalFi > 0 ? emTotal / totalFi : 0,
      isSubtotal: true,
    });
    for (const sr of orderedSub('Fixed Income', em, FI_SUBREGION_ORDER[em] ?? [])) {
      const srTotal = sumByBucketEmDmSubregion[`Fixed Income|${em}|${sr}`] ?? 0;
      out.push({
        key: `fi-${em}-${sr}`,
        level: 2,
        label: sr,
        usd: srTotal,
        pct_foreign: pctFor(srTotal),
        pct_asset_class: totalFi > 0 ? srTotal / totalFi : 0,
        isSubtotal: true,
      });
      for (const cat of orderedCat('Fixed Income', em, sr)) {
        const usd =
          lookup.get(`Fixed Income|${em}|${sr}|${cat}`) ?? 0;
        if (usd === 0) continue; // skip empty FI categories to avoid clutter
        out.push({
          key: `fi-${em}-${sr}-${cat}`,
          level: 3,
          label: cat,
          usd,
          pct_foreign: pctFor(usd),
          pct_asset_class: totalFi > 0 ? usd / totalFi : 0,
          isSubtotal: false,
        });
      }
    }
  }
  out.push({
    key: 'fi-total',
    level: 1,
    label: 'Total Fixed Income',
    usd: totalFi,
    pct_foreign: pctFor(totalFi),
    pct_asset_class: 1,
    isSubtotal: true,
  });

  // ---------- Equity ----------
  for (const em of ['Emerging Markets', 'Developed Markets'] as const) {
    if (em === 'Emerging Markets') {
      out.push({
        key: `eq-header`,
        level: 0,
        label: 'Equity',
        usd: totalEquity,
        pct_foreign: pctFor(totalEquity),
        pct_asset_class: 1,
        isSubtotal: true,
      });
    }
    const emTotal = sumByBucketEmDm[`Equity|${em}`] ?? 0;
    out.push({
      key: `eq-${em}`,
      level: 1,
      label: em,
      usd: emTotal,
      pct_foreign: pctFor(emTotal),
      pct_asset_class: totalEquity > 0 ? emTotal / totalEquity : 0,
      isSubtotal: true,
    });
    for (const sr of orderedSub('Equity', em, EQUITY_SUBREGION_ORDER[em] ?? [])) {
      const srTotal = sumByBucketEmDmSubregion[`Equity|${em}|${sr}`] ?? 0;
      if (srTotal === 0) continue;
      out.push({
        key: `eq-${em}-${sr}`,
        level: 2,
        label: sr,
        usd: srTotal,
        pct_foreign: pctFor(srTotal),
        pct_asset_class: totalEquity > 0 ? srTotal / totalEquity : 0,
        isSubtotal: false,
      });
    }
  }
  out.push({
    key: 'eq-total',
    level: 1,
    label: 'Total Equity',
    usd: totalEquity,
    pct_foreign: pctFor(totalEquity),
    pct_asset_class: 1,
    isSubtotal: true,
  });

  // ---------- Standalone buckets ----------
  // 'Other' only appears under the new taxonomy (Balanced / n.a. / unclassified).
  for (const b of ['Private Equity', 'Other', 'Direct Investment', 'Unknown'] as const) {
    const v = sumByBucket[b] ?? 0;
    if (v === 0 && (b === 'Unknown' || b === 'Other')) continue;
    out.push({
      key: `bucket-${b}`,
      level: 0,
      label: b === 'Direct Investment' ? '[Direct Investment]' : b,
      usd: v,
      pct_foreign: pctFor(v),
      pct_asset_class: null,
      isSubtotal: true,
    });
  }

  // ---------- Grand total ----------
  out.push({
    key: 'grand-total',
    level: 0,
    label: 'Total Foreign Investment',
    usd: totalForeign,
    pct_foreign: 1,
    pct_asset_class: null,
    isSubtotal: true,
  });

  return out;
}
