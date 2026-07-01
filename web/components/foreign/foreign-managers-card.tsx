'use client';

import { Fragment, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtUsdMM } from '@/lib/format';
import type { ManagerRow } from '@/lib/queries-foreign';
import { cn } from '@/lib/utils';

type Section = 'em-fi' | 'dm-fi' | 'equity';

// FULL SQL (2026-06-26): la sección agrupa por la taxonomía nueva (nt_*), que sale
// 100% de dim_bd_funds (sin overlays manuales de region/category). Antes usaba
// r.region/r.category (legacy, con overlay) → ya no. Esto cambia los buckets de
// región vs el PDF Sec 10 (Brazil y Emerging Europe salen separados). Decisión del
// usuario: priorizar full-SQL sobre paridad-PDF (como Pearl Diver / DI).
//
// El toggle elige qué columna de sub-categoría FI mostrar (ambas son nt_).
type Taxonomy = 'sub_asset_class' | 'sub_category';

type Props = { rows: ManagerRow[] };

// Buckets sobre nt_region. EM/DM siguen la misma lógica que pdf_em_dm_nt en las vistas.
const EM_REGIONS = ['GEM', 'Latam', 'Brazil', 'Asia Pacific', 'Emerging Europe'] as const;
const DM_REGIONS = ['Global', 'North America', 'Europe', 'Japan'] as const;
const EQUITY_REGIONS = [
  'North America',
  'Europe',
  'Japan',
  'Global',
  'Asia Pacific',
  'Latam',
  'Brazil',
  'Emerging Europe',
  'GEM',
] as const;

// Category value para una fila bajo la taxonomía activa (ambas son nt_).
function categoryOf(r: ManagerRow, tax: Taxonomy): string {
  if (tax === 'sub_asset_class') return r.nt_sub_asset_class ?? 'n.a.';
  return r.nt_sub_category ?? 'n.a.'; // sub_category
}

function labelOf(cat: string): string {
  return cat;
}

function isFixedIncomeRow(r: ManagerRow): boolean {
  return (
    r.nt_asset_class === 'Fixed Income' ||
    (r.nt_asset_class === 'Alternative' &&
      (r.nt_category === 'Private Debt' || r.nt_category === 'Real Asset'))
  );
}

function isEquityRow(r: ManagerRow): boolean {
  return r.nt_asset_class === 'Equity';
}

// EM/DM derivado de nt_region (espejo de pdf_em_dm_nt en v_*_foreign_pdf).
function emDm(region: string | null): 'Emerging Markets' | 'Developed Markets' | null {
  if (!region) return null;
  if (
    ['GEM', 'Latam', 'Brazil', 'Asia Pacific', 'Asia Pacific ex Japan',
     'Emerging Europe', 'Middle East', 'RoW'].includes(region)
  )
    return 'Emerging Markets';
  if (['Global', 'North America', 'Europe', 'Japan', 'Australia'].includes(region))
    return 'Developed Markets';
  return null;
}

// nt_region ya separa Japan de Asia Pacific → no hace falta remapear.
function equityRegion(region: string | null): string | null {
  return region;
}

type ManagerAgg = {
  manager: string;
  active: number;
  passive: number;
  total: number;
  // Indexed by `${region}|${category}` for FI; for Equity just `${region}`.
  cells: Map<string, number>;
};

function aggregateForSection(
  rows: ManagerRow[],
  section: Section,
  tax: Taxonomy,
): ManagerAgg[] {
  const filter = (r: ManagerRow): { keep: boolean; region: string | null } => {
    if (section === 'em-fi')
      return {
        keep: isFixedIncomeRow(r) && emDm(r.nt_region) === 'Emerging Markets',
        region: r.nt_region,
      };
    if (section === 'dm-fi')
      return {
        keep: isFixedIncomeRow(r) && emDm(r.nt_region) === 'Developed Markets',
        region: r.nt_region,
      };
    return { keep: isEquityRow(r), region: equityRegion(r.nt_region) };
  };

  const byManager = new Map<string, ManagerAgg>();
  for (const r of rows) {
    const f = filter(r);
    if (!f.keep || !f.region) continue;
    let agg = byManager.get(r.manager);
    if (!agg) {
      agg = { manager: r.manager, active: 0, passive: 0, total: 0, cells: new Map() };
      byManager.set(r.manager, agg);
    }
    agg[r.fund_style === 'Passive' ? 'passive' : 'active'] += r.monto_usd_mm;
    agg.total += r.monto_usd_mm;
    if (section === 'equity') {
      const key = f.region;
      agg.cells.set(key, (agg.cells.get(key) ?? 0) + r.monto_usd_mm);
    } else {
      const cat = categoryOf(r, tax);
      const key = `${f.region}|${cat}`;
      agg.cells.set(key, (agg.cells.get(key) ?? 0) + r.monto_usd_mm);
    }
  }
  return Array.from(byManager.values()).sort((a, b) => b.total - a.total);
}

// For an FI section: per region, return only the categories that have any
// non-zero value across all managers (matches PDF behavior of dropping empty cols).
function computeFICategoriesByRegion(
  aggregated: ManagerAgg[],
  regions: readonly string[],
  catOrder: readonly string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const region of regions) {
    const present: string[] = [];
    for (const cat of catOrder) {
      const total = aggregated.reduce(
        (s, a) => s + (a.cells.get(`${region}|${cat}`) ?? 0),
        0,
      );
      if (total > 0) present.push(cat);
    }
    out.set(region, present);
  }
  return out;
}

export function ForeignManagersCard({ rows }: Props) {
  const [section, setSection] = useState<Section>('em-fi');
  // New taxonomy (BD_Funds.xlsx) is the default view; legacy is one click away.
  const [taxonomy, setTaxonomy] = useState<Taxonomy>('sub_category');

  const isEquity = section === 'equity';

  const aggregated = useMemo(
    () => aggregateForSection(rows, section, taxonomy),
    [rows, section, taxonomy],
  );

  const regions: readonly string[] =
    section === 'em-fi' ? EM_REGIONS : section === 'dm-fi' ? DM_REGIONS : EQUITY_REGIONS;

  // Candidate category order for the FI columns. Legacy uses the fixed PDF list;
  // the nt_ taxonomies derive the list from the data, ordered by total USD desc.
  const catOrder: string[] = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows) {
      if (!isFixedIncomeRow(r)) continue;
      const cat = categoryOf(r, taxonomy);
      totals.set(cat, (totals.get(cat) ?? 0) + r.monto_usd_mm);
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  }, [rows, taxonomy]);

  // For FI: dynamic categories per region (matches PDF). For Equity: single col per region.
  const fiCatsByRegion = useMemo(
    () => (isEquity ? null : computeFICategoriesByRegion(aggregated, regions, catOrder)),
    [aggregated, regions, isEquity, catOrder],
  );

  // For FI Total group, union of all FI cats present in any region.
  const totalGroupCats: string[] = useMemo(() => {
    if (isEquity || !fiCatsByRegion) return [];
    const seen = new Set<string>();
    for (const cats of fiCatsByRegion.values()) for (const c of cats) seen.add(c);
    return catOrder.filter((c) => seen.has(c));
  }, [fiCatsByRegion, isEquity, catOrder]);

  // Grand totals
  const grandTotal = aggregated.reduce((s, a) => s + a.total, 0);
  const grandActive = aggregated.reduce((s, a) => s + a.active, 0);
  const grandPassive = aggregated.reduce((s, a) => s + a.passive, 0);

  function pct(n: number, d: number): string {
    if (d === 0) return '0%';
    return `${Math.round((n / d) * 100)}%`;
  }

  function fmtCell(n: number): string {
    if (n === 0) return '—';
    return fmtUsdMM(n);
  }

  // Sum for one (region, category) across all managers, used for TOTAL row.
  function regionCatSum(region: string, cat: string): number {
    return aggregated.reduce((s, a) => s + (a.cells.get(`${region}|${cat}`) ?? 0), 0);
  }
  function regionSum(region: string): number {
    if (isEquity) {
      return aggregated.reduce((s, a) => s + (a.cells.get(region) ?? 0), 0);
    }
    return (fiCatsByRegion?.get(region) ?? []).reduce(
      (s, c) => s + regionCatSum(region, c),
      0,
    );
  }
  // Sum across all regions for a single FI category (for the Total <em-dm> column group).
  function totalGroupCatSum(cat: string): number {
    return regions.reduce((s, region) => s + regionCatSum(region, cat), 0);
  }

  function managerRegionSum(a: ManagerAgg, region: string): number {
    if (isEquity) return a.cells.get(region) ?? 0;
    return (fiCatsByRegion?.get(region) ?? []).reduce(
      (s, c) => s + (a.cells.get(`${region}|${c}`) ?? 0),
      0,
    );
  }
  function managerTotalGroupCatSum(a: ManagerAgg, cat: string): number {
    return regions.reduce((s, region) => s + (a.cells.get(`${region}|${cat}`) ?? 0), 0);
  }

  const sectionLabels: Record<Section, string> = {
    'em-fi': 'Fixed Income — Emerging Markets',
    'dm-fi': 'Fixed Income — Developed Markets',
    equity: 'Equity',
  };
  const totalGroupName: Record<Section, string> = {
    'em-fi': 'Total Emerging Markets',
    'dm-fi': 'Total Developed Markets',
    equity: 'Total',
  };
  const taxonomyLabel: Record<Taxonomy, string> = {
    sub_asset_class: 'Sub Asset Class',
    sub_category: 'Sub-Category',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-sm font-medium">
              Managers — Foreign {sectionLabels[section]}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Foreign holdings aggregated by fund manager. Region &amp; asset
              class from the new taxonomy (<code>nt_region</code> /{' '}
              <code>nt_asset_class</code>) — 100% SQL, no manual overlay.
              Active/Passive from <code>dim_bd_funds.style</code> (ETFs and index
              funds = Passive).
              {!isEquity && (
                <>
                  {' '}FI columns grouped by <code>{taxonomyLabel[taxonomy]}</code>.
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isEquity && (
              <SegmentedControl
                ariaLabel="Taxonomy"
                value={taxonomy}
                onChange={setTaxonomy}
                options={[
                  { value: 'sub_asset_class' as Taxonomy, label: 'Sub AC' },
                  { value: 'sub_category' as Taxonomy, label: 'Sub Cat' },
                ]}
              />
            )}
            <SegmentedControl
              ariaLabel="Section"
              value={section}
              onChange={setSection}
              options={[
                { value: 'em-fi' as Section, label: 'EM FI' },
                { value: 'dm-fi' as Section, label: 'DM FI' },
                { value: 'equity' as Section, label: 'Equity' },
              ]}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              {/* Two-row header: region groups + per-category */}
              <TableRow>
                <TableHead rowSpan={isEquity ? 1 : 2} className="align-bottom">
                  Manager
                </TableHead>
                <TableHead rowSpan={isEquity ? 1 : 2} className="text-right align-bottom">
                  Active
                </TableHead>
                <TableHead rowSpan={isEquity ? 1 : 2} className="text-right align-bottom">
                  Passive
                </TableHead>
                {regions.map((region) => {
                  const cats = isEquity ? [] : (fiCatsByRegion?.get(region) ?? []);
                  const span = isEquity ? 1 : Math.max(cats.length + 1, 1);
                  return (
                    <TableHead
                      key={`grp-${region}`}
                      colSpan={span}
                      className={cn('text-center', !isEquity && 'border-l border-border')}
                    >
                      {region}
                    </TableHead>
                  );
                })}
                <TableHead
                  colSpan={isEquity ? 1 : Math.max(totalGroupCats.length + 1, 1)}
                  className="text-center border-l border-border bg-muted/20"
                >
                  {totalGroupName[section]}
                </TableHead>
              </TableRow>
              {!isEquity && (
                <TableRow>
                  {regions.map((region) => {
                    const cats = fiCatsByRegion?.get(region) ?? [];
                    return (
                      <Fragment key={`hdr-${region}`}>
                        {cats.map((c) => (
                          <TableHead
                            key={`${region}-${c}`}
                            className="text-right text-[10px] border-l border-border/40"
                          >
                            {labelOf(c)}
                          </TableHead>
                        ))}
                        <TableHead
                          key={`${region}-total`}
                          className="text-right text-[10px] font-semibold border-l border-border/40"
                        >
                          Total
                        </TableHead>
                      </Fragment>
                    );
                  })}
                  {totalGroupCats.map((c) => (
                    <TableHead
                      key={`tot-${c}`}
                      className="text-right text-[10px] border-l border-border/40 bg-muted/20"
                    >
                      {labelOf(c)}
                    </TableHead>
                  ))}
                  <TableHead
                    key="grand-tot"
                    className="text-right text-[10px] font-semibold border-l border-border/40 bg-muted/20"
                  >
                    Total
                  </TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {aggregated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={99} className="text-muted-foreground italic text-center py-6">
                    No managers in this section for the selected fecha.
                  </TableCell>
                </TableRow>
              ) : (
                aggregated.map((a) => (
                  <TableRow key={a.manager}>
                    <TableCell className="font-medium">{a.manager}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {pct(a.active, a.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {pct(a.passive, a.total)}
                    </TableCell>
                    {regions.map((region) => {
                      if (isEquity) {
                        return (
                          <TableCell
                            key={region}
                            className="text-right tabular-nums border-l border-border/40"
                          >
                            {fmtCell(a.cells.get(region) ?? 0)}
                          </TableCell>
                        );
                      }
                      const cats = fiCatsByRegion?.get(region) ?? [];
                      return (
                        <Fragment key={`row-${a.manager}-${region}`}>
                          {cats.map((c) => (
                            <TableCell
                              key={`${region}-${c}`}
                              className="text-right tabular-nums border-l border-border/40"
                            >
                              {fmtCell(a.cells.get(`${region}|${c}`) ?? 0)}
                            </TableCell>
                          ))}
                          <TableCell
                            key={`${region}-total`}
                            className="text-right tabular-nums font-semibold border-l border-border/40"
                          >
                            {fmtCell(managerRegionSum(a, region))}
                          </TableCell>
                        </Fragment>
                      );
                    })}
                    {!isEquity &&
                      totalGroupCats.map((c) => (
                        <TableCell
                          key={`tot-${c}`}
                          className="text-right tabular-nums border-l border-border/40 bg-muted/10"
                        >
                          {fmtCell(managerTotalGroupCatSum(a, c))}
                        </TableCell>
                      ))}
                    <TableCell className="text-right tabular-nums font-semibold border-l border-border/40 bg-muted/10">
                      {fmtCell(a.total)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {aggregated.length > 0 && (
                <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(grandActive, grandTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(grandPassive, grandTotal)}
                  </TableCell>
                  {regions.map((region) => {
                    if (isEquity) {
                      return (
                        <TableCell
                          key={region}
                          className="text-right tabular-nums border-l border-border/40"
                        >
                          {fmtCell(regionSum(region))}
                        </TableCell>
                      );
                    }
                    const cats = fiCatsByRegion?.get(region) ?? [];
                    return (
                      <Fragment key={`tot-${region}`}>
                        {cats.map((c) => (
                          <TableCell
                            key={`${region}-${c}`}
                            className="text-right tabular-nums border-l border-border/40"
                          >
                            {fmtCell(regionCatSum(region, c))}
                          </TableCell>
                        ))}
                        <TableCell
                          key={`${region}-total`}
                          className="text-right tabular-nums border-l border-border/40"
                        >
                          {fmtCell(regionSum(region))}
                        </TableCell>
                      </Fragment>
                    );
                  })}
                  {!isEquity &&
                    totalGroupCats.map((c) => (
                      <TableCell
                        key={`tot-${c}`}
                        className="text-right tabular-nums border-l border-border/40"
                      >
                        {fmtCell(totalGroupCatSum(c))}
                      </TableCell>
                    ))}
                  <TableCell className="text-right tabular-nums border-l border-border/40">
                    {fmtCell(grandTotal)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
