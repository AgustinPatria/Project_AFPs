'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ForeignTaxonomy } from '@/lib/types-foreign';

/**
 * Switches the foreign buckets between the new fund taxonomy (BD_Funds, default)
 * and the legacy dim_bd_funds buckets that reproduce the PDF Sec 07. Writes the
 * choice to the `tax` query param (omitted when 'nt' so the default URL is clean).
 */
export function ForeignTaxonomyToggle({ current }: { current: ForeignTaxonomy }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function set(value: ForeignTaxonomy) {
    const params = new URLSearchParams(searchParams);
    if (value === 'nt') params.delete('tax');
    else params.set('tax', value);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <SegmentedControl<ForeignTaxonomy>
      ariaLabel="Taxonomy"
      value={current}
      onChange={set}
      options={[
        { value: 'nt', label: 'New taxonomy' },
        { value: 'legacy', label: 'Legacy (PDF)' },
      ]}
    />
  );
}
