import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtPct, fmtUsdMM } from '@/lib/format';
import type { GicsBreakdown, GicsSectorRow } from '@/lib/queries-chilean-stocks';
import { cn } from '@/lib/utils';

/**
 * Sec 05 portfolio breakdown — Chilean equity holdings grouped by GICS sector.
 * Data via dim_ipd_instrumentos (BBG GICS classification) + dim_chilean_ticker_homol.
 * Top 5 issuers per sector exposed for drill-down.
 */
export function ChileanStocksGicsCard({ data }: { data: GicsBreakdown }) {
  const { totalAumUsdMm, sectors } = data;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-sm font-medium">
              Portfolio Breakdown — GICS Sectors · AFPs
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">
              Aggregate AFP holdings classified via{' '}
              <code className="font-mono text-[10px] bg-muted/50 px-1 py-px rounded">
                dim_ipd_instrumentos.sector_gics
              </code>
              {' '}with PDF-parity overrides applied from{' '}
              <code className="font-mono text-[10px] bg-muted/50 px-1 py-px rounded">
                dim_chilean_stocks_gics_override
              </code>
              {' '}— SQM holding companies (NORTE GRANDE / NITRATOS / ORO BLANCO) → Materials, real-estate developers (PAZ CORP / SOCOVESA / INMOBILIARIA MANQUEHUE) → Real Est.{' · '}
              {sectors.length} sectors · {sectors.reduce((s, x) => s + x.nEmisores, 0)} issuers · matches PDF Sec 05 AFPs column within ±0.5pp per sector.{' '}
              Pionero / MRV / IPSA columns + Quartile table pending Tupungato month-end + Bloomberg sync.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total AUM
            </div>
            <div className="text-xl font-semibold tracking-tight tabular-nums">
              {fmtUsdMM(totalAumUsdMm)}
              <span className="text-[11px] text-muted-foreground font-normal ml-1.5">
                USD MM
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {sectors.map((s) => (
            <SectorRow key={s.sector} sector={s} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SectorRow({ sector }: { sector: GicsSectorRow }) {
  const widthPct = Math.max(0, Math.min(100, sector.pct * 100));
  return (
    <div className="group rounded-md hover:bg-muted/30 transition-colors px-3 py-2 -mx-3">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{sector.sectorName}</div>
          <div className="mt-1 h-1 rounded bg-muted/40 overflow-hidden">
            <div
              className="h-full bg-brand/60 rounded"
              style={{ width: `${widthPct}%` }}
            />
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground text-right tabular-nums shrink-0 w-12">
          {sector.nEmisores}{' '}
          <span className="text-muted-foreground/60">
            {sector.nEmisores === 1 ? 'co.' : 'cos.'}
          </span>
        </div>
        <div className="text-sm font-medium tabular-nums shrink-0 w-20 text-right">
          {fmtUsdMM(sector.aumUsdMm)}
        </div>
        <div
          className={cn(
            'text-xs tabular-nums shrink-0 w-12 text-right',
            sector.pct >= 0.1 ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {fmtPct(sector.pct)}
        </div>
      </div>
      {sector.topIssuers.length > 0 ? (
        <div className="mt-1.5 pl-3 hidden group-hover:block">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
            Top issuers
          </div>
          <div className="space-y-0.5">
            {sector.topIssuers.map((iss) => (
              <div
                key={iss.emisor}
                className="grid grid-cols-[1fr_auto] gap-2 text-[11px]"
              >
                <span className="truncate text-muted-foreground">{iss.emisor}</span>
                <span className="tabular-nums text-foreground/80">
                  {fmtUsdMM(iss.aumUsdMm)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
