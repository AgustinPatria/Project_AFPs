'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TabDef = {
  id: string;
  label: ReactNode;
  count?: number;
};

/**
 * URL-driven tabs. State lives in ?tab=<id>, so reloads/bookmarks preserve the
 * active tab and the rest of the page query params (e.g. ?fecha=) survive
 * tab switches. Renders as <Link>s, not buttons — gets Next's client-side
 * navigation + prefetch for free.
 */
export function TabNav({
  current,
  tabs,
  paramKey = 'tab',
  className,
}: {
  current: string;
  tabs: readonly TabDef[];
  paramKey?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(tabId: string): string {
    const params = new URLSearchParams(searchParams);
    params.set(paramKey, tabId);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 border-b border-border -mx-6 lg:-mx-8 px-6 lg:px-8',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            role="tab"
            aria-selected={active}
            scroll={false}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2.5 -mb-px text-sm font-medium border-b-2 transition-colors',
              active
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.label}
            {tab.count != null ? (
              <span
                className={cn(
                  'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                  active
                    ? 'bg-brand/15 text-brand'
                    : 'bg-muted/40 text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
