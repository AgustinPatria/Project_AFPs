import { Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { AsOfBadge } from '@/components/as-of-badge';
import { Disclaimer } from '@/components/disclaimer';
import { NotFromSql } from '@/components/not-from-sql';
import { DistributorsSec09Table } from '@/components/distributors/sec09-table';
import {
  distributorBaselines,
  getDistributorsSec09Batch,
  getDistributorsSec09Dates,
} from '@/lib/queries-distributors';

export const revalidate = 3600;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha: fechaParam } = await searchParams;
  const dates = await getDistributorsSec09Dates();
  if (dates.length === 0) {
    return (
      <main className="p-8">
        <PageHeader
          title="Distributors"
          subtitle="Sec 09 · Distributors & Managers — Foreign Investment"
          titleIcon={<Users className="h-5 w-5 text-brand" />}
        />
        <p className="text-sm text-muted-foreground mt-6">Sin data disponible.</p>
      </main>
    );
  }

  const fecha = fechaParam && dates.includes(fechaParam) ? fechaParam : dates[0];
  const baselines = distributorBaselines(fecha);

  // Some baselines may not exist in the dataset (e.g. early backfill). Fall
  // back to the closest available fecha <= the target.
  const dateSet = new Set(dates);
  function resolve(target: string): string {
    if (dateSet.has(target)) return target;
    return dates.find((d) => d <= target) ?? target;
  }
  const resolved = {
    oneYearAgo: resolve(baselines.oneYearAgo),
    lastYearEnd: resolve(baselines.lastYearEnd),
    lastMonth: resolve(baselines.lastMonth),
    today: fecha,
  };

  const rows = await getDistributorsSec09Batch([
    resolved.oneYearAgo,
    resolved.lastYearEnd,
    resolved.lastMonth,
    resolved.today,
  ]);

  return (
    <main className="px-6 lg:px-8 pb-12">
      <PageHeader
        title="Distributors"
        subtitle="Sec 09 · Distributors & Managers — Foreign Investment"
        titleIcon={<Users className="h-5 w-5 text-brand" />}
        dates={dates}
        currentDate={fecha}
      >
        <AsOfBadge module="distributors" />
      </PageHeader>
      <div className="mt-6 space-y-6">
        <Disclaimer variant="foreign-lag">
          Analysis includes only foreign investments.
        </Disclaimer>
        {/* Montos desde SQL (consolidated_sd), pero la dimensión que organiza la tabla
            —el mapeo manager→distribuidor— es manual (pendiente #6). Ver lineage. */}
        <NotFromSql reason="Montos desde SQL (consolidated_sd), pero el mapeo manager→distribuidor es manual (dim_distributor_by_manager + overlay). Aún no en SQL fuente única (pendiente #6).">
          <DistributorsSec09Table rows={rows} fechas={resolved} />
        </NotFromSql>
      </div>
    </main>
  );
}
