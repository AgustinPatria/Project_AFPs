'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Date picker with prev/next chevrons. The dates array is expected to be
 * sorted descending (most recent first) — same shape every page query uses —
 * so "previous month" = index + 1 in that list.
 */
export function DateSelector({
  dates,
  current,
}: {
  dates: string[];
  current: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const idx = dates.indexOf(current);
  // dates DESC: idx-1 is more recent, idx+1 is older.
  const newerDate = idx > 0 ? dates[idx - 1] : null;
  const olderDate = idx >= 0 && idx + 1 < dates.length ? dates[idx + 1] : null;

  function navigate(value: string | null) {
    if (!value) return;
    const params = new URLSearchParams(searchParams);
    params.set('fecha', value);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  const navButtonBase =
    'flex h-9 w-7 items-center justify-center rounded-md border border-border bg-background transition-colors';

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => navigate(olderDate)}
        disabled={!olderDate}
        aria-label="Previous month"
        title={olderDate ? `Go to ${olderDate}` : 'No earlier date available'}
        className={cn(
          navButtonBase,
          olderDate
            ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            : 'text-muted-foreground/40 cursor-not-allowed',
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <Select value={current} onValueChange={navigate}>
        <SelectTrigger className="w-[160px] tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dates.map((d) => (
            <SelectItem key={d} value={d} className="tabular-nums">
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() => navigate(newerDate)}
        disabled={!newerDate}
        aria-label="Next month"
        title={newerDate ? `Go to ${newerDate}` : 'No later date available'}
        className={cn(
          navButtonBase,
          newerDate
            ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            : 'text-muted-foreground/40 cursor-not-allowed',
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
