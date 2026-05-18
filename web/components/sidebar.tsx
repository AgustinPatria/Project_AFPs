'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  PieChart,
  Target,
  Globe,
  Building2,
  Users,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  // ready=false renders a disabled link (placeholder for sections still in build).
  ready?: boolean;
};

// PDF section prefix shown left of each label so the sidebar maps 1:1 onto the
// printed report. Sections 08 and 10 don't have routes yet.
type PdfSection = string | null; // e.g. '01', '02·03', null for legacy.
const NAV: (NavItem & { pdf: PdfSection })[] = [
  { href: '/', label: 'Alternative Assets', icon: Briefcase, ready: true, pdf: null },
  { href: '/market-share', label: 'Market Share', icon: BarChart3, ready: true, pdf: '01' },
  { href: '/asset-allocation', label: 'Asset Allocation', icon: PieChart, ready: true, pdf: '02·03' },
  { href: '/strategy', label: 'Strategy', icon: Target, ready: true, pdf: '04' },
  { href: '/foreign', label: 'Foreign Investment', icon: Globe, ready: true, pdf: '07' },
  { href: '/chilean-stocks', label: 'Chilean Stocks', icon: Building2, pdf: '05·06' },
  { href: '/distributors', label: 'Distributors', icon: Users, pdf: '09' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar h-screen sticky top-0 flex flex-col">
      <div className="px-6 pt-6 pb-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          <div className="text-xl font-bold tracking-[0.22em] text-sidebar-foreground leading-none">
            PATRIA
          </div>
        </div>
        <div className="mt-1.5 ml-3.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
          AFP Chile
        </div>
      </div>
      <nav className="px-3 space-y-0.5">
        {NAV.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
          const Icon = item.icon;
          const base =
            'group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors';
          const sectionTag = item.pdf ? (
            <span
              className={cn(
                'ml-auto inline-flex items-center rounded px-1 py-px text-[10px] tabular-nums font-mono tracking-tight shrink-0',
                isActive
                  ? 'bg-brand/15 text-brand'
                  : 'text-muted-foreground/60 group-hover:text-muted-foreground',
              )}
            >
              {item.pdf}
            </span>
          ) : null;
          if (!item.ready) {
            return (
              <span
                key={item.href}
                className={cn(
                  base,
                  'text-muted-foreground/40 cursor-not-allowed select-none',
                )}
                title="Coming soon"
              >
                <Icon className="h-4 w-4" />
                {item.label}
                <span className="ml-auto inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide bg-muted/30 text-muted-foreground/60">
                  Soon
                </span>
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                base,
                isActive
                  ? 'bg-brand/10 text-sidebar-foreground shadow-[inset_3px_0_0_var(--brand)]'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', isActive && 'text-brand')} />
              {item.label}
              {sectionTag}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-6 py-4 border-t border-sidebar-border space-y-2">
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
          <span>Quick search</span>
          <kbd className="font-mono border border-border rounded px-1 py-px bg-muted/30">
            ⌘ K
          </kbd>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-sidebar-foreground/60">
            AFP Chile Dashboard
          </div>
          <div className="text-[10px] text-muted-foreground/70 mt-0.5">
            v0.3 · Nov-25
          </div>
        </div>
      </div>
    </aside>
  );
}
