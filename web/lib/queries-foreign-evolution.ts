import { supabase } from './supabase-server';

export type AssetClassEvoPoint = {
  fecha_reporte: string;
  // Top level totals
  em_total: number;
  dm_total: number;
  // EM by subregion (FI: GEM, Latam, Asia Pacific; Eq: Asia Pacific ex Japan, Emerging Europe, GEM, Latam)
  em_by_subregion: Record<string, number>;
  // DM by subregion (FI: Global, NA, Europe; Eq: Europe, Japan, NA, Global)
  dm_by_subregion: Record<string, number>;
};

/**
 * Evolution series for Sec 07 pages 7 (FI) and 8 (Equity). Returns one row per
 * fecha_reporte with USD MM totals + subregion splits, both EM and DM. The page
 * derives % shares and monthly Net Change from these series client-side.
 */
export async function getAssetClassEvolution(
  pdfBucket: 'Fixed Income' | 'Equity',
): Promise<AssetClassEvoPoint[]> {
  // PostgREST defaults to 1000 rows so paginate explicitly. ~15 months × 8
  // rows per fecha = 120 rows, but past horizon may grow so leave headroom.
  const rows: Array<{
    fecha_reporte: string;
    pdf_em_dm: string | null;
    pdf_subregion: string | null;
    monto_usd_mm: number | null;
  }> = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('v_foreign_pdf_summary_combined')
      .select('fecha_reporte,pdf_em_dm,pdf_subregion,monto_usd_mm')
      .eq('pdf_bucket', pdfBucket)
      .order('fecha_reporte', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      rows.push({
        fecha_reporte: r.fecha_reporte as string,
        pdf_em_dm: (r.pdf_em_dm as string | null) ?? null,
        pdf_subregion: (r.pdf_subregion as string | null) ?? null,
        monto_usd_mm: r.monto_usd_mm == null ? null : Number(r.monto_usd_mm),
      });
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const byFecha = new Map<string, AssetClassEvoPoint>();
  for (const r of rows) {
    let p = byFecha.get(r.fecha_reporte);
    if (!p) {
      p = {
        fecha_reporte: r.fecha_reporte,
        em_total: 0,
        dm_total: 0,
        em_by_subregion: {},
        dm_by_subregion: {},
      };
      byFecha.set(r.fecha_reporte, p);
    }
    const usd = r.monto_usd_mm ?? 0;
    if (r.pdf_em_dm === 'Emerging Markets') {
      p.em_total += usd;
      if (r.pdf_subregion) {
        p.em_by_subregion[r.pdf_subregion] =
          (p.em_by_subregion[r.pdf_subregion] ?? 0) + usd;
      }
    } else if (r.pdf_em_dm === 'Developed Markets') {
      p.dm_total += usd;
      if (r.pdf_subregion) {
        p.dm_by_subregion[r.pdf_subregion] =
          (p.dm_by_subregion[r.pdf_subregion] ?? 0) + usd;
      }
    }
  }

  return Array.from(byFecha.values()).sort((a, b) =>
    a.fecha_reporte.localeCompare(b.fecha_reporte),
  );
}
