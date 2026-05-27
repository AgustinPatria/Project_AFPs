'use client';

import { useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ForeignClassEvolution } from './foreign-class-evolution';
import type { AssetClassEvoPoint } from '@/lib/queries-foreign-evolution';

type View = 'fi' | 'eq';

export function ForeignEvolutionTabs({
  fiSeries,
  eqSeries,
}: {
  fiSeries: AssetClassEvoPoint[];
  eqSeries: AssetClassEvoPoint[];
}) {
  const [view, setView] = useState<View>('fi');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <SegmentedControl
          ariaLabel="Asset class"
          value={view}
          onChange={setView}
          options={[
            { value: 'fi' as const, label: 'Fixed Income' },
            { value: 'eq' as const, label: 'Equity' },
          ]}
        />
      </div>
      {view === 'fi' ? (
        <ForeignClassEvolution
          title="Fixed Income"
          series={fiSeries}
          emSubregions={['GEM', 'Latam', 'Asia Pacific']}
          dmSubregions={['Global', 'North America', 'Europe']}
        />
      ) : (
        <ForeignClassEvolution
          title="Equity"
          series={eqSeries}
          emSubregions={['Asia Pacific ex Japan', 'Emerging Europe', 'GEM', 'Latam']}
          dmSubregions={['Europe', 'Japan', 'North America', 'Global']}
        />
      )}
    </div>
  );
}
