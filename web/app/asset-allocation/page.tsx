export const revalidate = 3600;

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Disclaimer } from '@/components/disclaimer';
import { PageHeader } from '@/components/page-header';
import { AsOfBadge } from '@/components/as-of-badge';
import { AssetClassMatrix } from '@/components/asset-allocation/asset-class-matrix';
import {
  AssetAllocationOverTime,
  LimitsPerFund,
} from '@/components/asset-allocation/evolution-charts';
import { LocalFiBreakdown } from '@/components/asset-allocation/local-fi-breakdown';
import {
  getAssetAllocationDates,
  getAssetClassByAfp,
  getAssetClassByTipo,
  getAssetClassEvolution,
  getLocalFiByAfp,
} from '@/lib/queries-asset-allocation';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha: fechaParam } = await searchParams;
  const dates = await getAssetAllocationDates();
  const fecha =
    fechaParam && dates.includes(fechaParam) ? fechaParam : dates[0];

  if (!fecha) {
    return (
      <main className="p-8">
        <p className="text-muted-foreground">No data available.</p>
      </main>
    );
  }

  const [byAfp, byTipo, localFi, evolution] = await Promise.all([
    getAssetClassByAfp(fecha),
    getAssetClassByTipo(fecha),
    getLocalFiByAfp(fecha),
    getAssetClassEvolution(),
  ]);

  // AFP-level Total Assets (USD MM) — denominator for Local FI's "% of Total
  // AUM" view (matches the PDF). byAfp already includes a TOTAL row.
  const totalAssetsByAfp: Record<string, number> = {};
  for (const r of byAfp) {
    if (r.pdf_category === 'Total Assets' && r.monto_dolares != null) {
      totalAssetsByAfp[r.afp] = r.monto_dolares;
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Asset Class Distribution"
        subtitle="AFP Chile · system view at month-end"
        dates={dates}
        currentDate={fecha}
      >
        <AsOfBadge module="asset_allocation" />
      </PageHeader>

      <Disclaimer variant="data-sources" />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Asset Class Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AssetClassMatrix byAfp={byAfp} byTipo={byTipo} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Local Fixed Income — Breakdown by Issuer Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LocalFiBreakdown
            rows={localFi}
            totalAssetsByAfp={totalAssetsByAfp}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Asset Allocation Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AssetAllocationOverTime rows={evolution} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Limits per Fund Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LimitsPerFund rows={evolution} />
        </CardContent>
      </Card>
    </main>
  );
}
