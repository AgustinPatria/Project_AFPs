'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StrategyFamily } from '@/lib/queries-strategy';

export function StrategyFamilySelector({
  families,
  current,
}: {
  families: StrategyFamily[];
  current: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(value: string | null) {
    if (!value) return;
    const next = new URLSearchParams(params);
    next.set('family', value);
    next.delete('periodo'); // reset periodo when changing family
    startTransition(() => router.push(`?${next.toString()}`));
  }

  const currentFamily = families.find((f) => f.family_id === current);

  return (
    <Select value={String(current)} onValueChange={onChange}>
      <SelectTrigger className="w-[260px]">
        <SelectValue>{currentFamily?.family_name ?? 'Select strategy…'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {families.map((f) => (
          <SelectItem key={f.family_id} value={String(f.family_id)}>
            {f.family_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
