'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ALT_AFPS, type AfpOrSystem } from '@/lib/types-alternatives';

const OPTIONS = ['SYSTEM', ...ALT_AFPS] as const;

/** URL-driven AFP picker for the Detail tab (?afp=). */
export function AfpSelector({ current }: { current: AfpOrSystem }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function navigate(afp: AfpOrSystem) {
    const params = new URLSearchParams(searchParams);
    params.set('afp', afp);
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <SegmentedControl
      ariaLabel="AFP"
      value={current}
      onChange={navigate}
      options={OPTIONS.map((afp) => ({ value: afp, label: afp }))}
    />
  );
}
