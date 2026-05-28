import { supabase } from './supabase-server';

export type ChileanStockIssuerRow = {
  emisor: string;
  monto_usd_mm: number;
};

export type ChileanFlowsBucket = {
  purchases: ChileanStockIssuerRow[];
  sales: ChileanStockIssuerRow[];
  totalNet: number;
};

export type ChileanStocksTopFlows = {
  fechaEnd: string;
  fechaMtdStart: string;
  fechaYtdStart: string;
  fechaLtmStart: string;
  mtd: ChileanFlowsBucket;
  ytd: ChileanFlowsBucket;
  ltm: ChileanFlowsBucket;
};

async function getByIssuer(fecha: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('v_chilean_stocks_by_issuer_combined')
    .select('emisor,monto_usd_mm')
    .eq('fecha_reporte', fecha);
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of data ?? []) {
    const e = r.emisor as string;
    out.set(e, (out.get(e) ?? 0) + (Number(r.monto_usd_mm) || 0));
  }
  return out;
}

function computeFlows(
  endMap: Map<string, number>,
  startMap: Map<string, number>,
  topN: number,
): ChileanFlowsBucket {
  const allEmisores = new Set([...endMap.keys(), ...startMap.keys()]);
  const deltas: ChileanStockIssuerRow[] = [];
  let totalNet = 0;
  for (const e of allEmisores) {
    const delta = (endMap.get(e) ?? 0) - (startMap.get(e) ?? 0);
    deltas.push({ emisor: e, monto_usd_mm: delta });
    totalNet += delta;
  }
  deltas.sort((a, b) => b.monto_usd_mm - a.monto_usd_mm);
  return {
    purchases: deltas.filter((d) => d.monto_usd_mm > 0).slice(0, topN),
    sales: deltas.filter((d) => d.monto_usd_mm < 0).slice(-topN).reverse(),
    totalNet,
  };
}

/**
 * MTD/YTD/LTM top purchases & sales of chilean stocks (PDF 06).
 *
 * Caveat: deltas are Total Change (end - start), which conflates true cash
 * flows with market-return effects. PDF 06 uses CHIST units × price to compute
 * pure transaction flows; we only have units × price for fechas inside CHIST
 * (≤ Nov-25). For SP XML fechas (Dec-25 onwards) only monto is available, so
 * the rankings reflect both purchases and price moves.
 */
export async function getChileanStocksTopFlows(
  fecha: string,
  topN = 10,
): Promise<ChileanStocksTopFlows> {
  const [y, m] = fecha.split('-').map(Number);
  const lastDayOfMonth = (year: number, month1Indexed: number) =>
    new Date(Date.UTC(year, month1Indexed, 0)).toISOString().slice(0, 10);
  const mtd = lastDayOfMonth(y, m - 1);
  const ytd = `${y - 1}-12-31`;
  const ltm = lastDayOfMonth(y - 1, m);

  const [endMap, mtdMap, ytdMap, ltmMap] = await Promise.all([
    getByIssuer(fecha),
    getByIssuer(mtd),
    getByIssuer(ytd),
    getByIssuer(ltm),
  ]);
  return {
    fechaEnd: fecha,
    fechaMtdStart: mtd,
    fechaYtdStart: ytd,
    fechaLtmStart: ltm,
    mtd: computeFlows(endMap, mtdMap, topN),
    ytd: computeFlows(endMap, ytdMap, topN),
    ltm: computeFlows(endMap, ltmMap, topN),
  };
}

export async function getChileanStocksDates(): Promise<string[]> {
  // Source = v_chilean_stocks_gics (CHIST-bound, max ~Nov-25 today). The
  // by-issuer view goes further (SP XML covers Dec-25..Apr-26) but GICS
  // classification needs nemo-level data only CHIST has. Picking gics dates
  // here keeps the default landing fecha aligned with both cards on this
  // page; users wanting SP XML transactions can still navigate via URL.
  const { data, error } = await supabase
    .from('v_chilean_stocks_gics')
    .select('fecha_reporte')
    .order('fecha_reporte', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.fecha_reporte as string)));
}

// =====================================================================
// PDF Sec 05 — Portfolio breakdown por sector GICS
// =====================================================================

export type GicsSectorRow = {
  sector: string;        // gics_sector_shortname (e.g. "Financials")
  sectorName: string;    // gics_sector_name
  nEmisores: number;
  aumUsdMm: number;
  pct: number;
  topIssuers: { emisor: string; aumUsdMm: number }[];
};

export type GicsBreakdown = {
  fecha: string;
  totalAumUsdMm: number;
  sectors: GicsSectorRow[];
};

/**
 * Sec 05 portfolio breakdown by GICS sector. Aggregates v_chilean_stocks_gics
 * across AFP × multifondo for a given fecha. Returns sectors ranked by AUM
 * with the top 5 issuers per sector for drill-down.
 */
export async function getChileanStocksGicsBreakdown(
  fecha: string,
): Promise<GicsBreakdown> {
  // Supabase REST caps at 1,000 rows per request. View has ~1,750 rows per fecha
  // (7 AFPs × 5 multifondos × ~50 emisores), so paginate.
  type Row = {
    gics_sector: string | null;
    gics_sector_name: string | null;
    emisor: string | null;
    nemo: string | null;
    monto_usd_mm: number | null;
  };
  const rows: Row[] = [];
  let offset = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('v_chilean_stocks_gics')
      .select('gics_sector, gics_sector_name, emisor, nemo, monto_usd_mm')
      .eq('fecha_reporte', fecha)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const data = rows;

  // Aggregate by sector first
  type AccSector = {
    sectorName: string;
    issuers: Map<string, number>;
    total: number;
  };
  const bySector = new Map<string, AccSector>();
  let total = 0;
  for (const r of data ?? []) {
    const sector = (r.gics_sector as string) ?? '—';
    const sectorName = (r.gics_sector_name as string) ?? '—';
    const emisor = (r.emisor as string) ?? '—';
    const amount = Number(r.monto_usd_mm) || 0;
    if (!bySector.has(sector)) {
      bySector.set(sector, { sectorName, issuers: new Map(), total: 0 });
    }
    const acc = bySector.get(sector)!;
    acc.issuers.set(emisor, (acc.issuers.get(emisor) ?? 0) + amount);
    acc.total += amount;
    total += amount;
  }

  const sectors: GicsSectorRow[] = Array.from(bySector.entries())
    .map(([sector, acc]) => {
      const sortedIssuers = Array.from(acc.issuers.entries())
        .map(([emisor, aumUsdMm]) => ({ emisor, aumUsdMm }))
        .sort((a, b) => b.aumUsdMm - a.aumUsdMm);
      return {
        sector,
        sectorName: acc.sectorName,
        nEmisores: acc.issuers.size,
        aumUsdMm: acc.total,
        pct: total > 0 ? acc.total / total : 0,
        topIssuers: sortedIssuers.slice(0, 5),
      };
    })
    .sort((a, b) => b.aumUsdMm - a.aumUsdMm);

  return { fecha, totalAumUsdMm: total, sectors };
}
