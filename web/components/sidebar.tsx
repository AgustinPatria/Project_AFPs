'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  PieChart,
  Target,
  Globe,
  Building2,
  Users,
  UserCog,
  Briefcase,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/app/login/actions';

type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  // ready=false renders a disabled link (placeholder for sections still in build).
  ready?: boolean;
};

// PDF section prefix shown left of each label so the sidebar maps 1:1 onto the
// printed report. Sec 08 (Top Net Purchases and Sales — Foreign Funds) lives
// inside /foreign as the Top Flows card of the Changes tab.
type PdfSection = string | null; // e.g. '01', '02·03', null for legacy.
const NAV: (NavItem & { pdf: PdfSection })[] = [
  { href: '/', label: 'Alternative Assets', icon: Briefcase, ready: true, pdf: null },
  { href: '/market-share', label: 'Market Share', icon: BarChart3, ready: true, pdf: '01' },
  { href: '/asset-allocation', label: 'Asset Allocation', icon: PieChart, ready: true, pdf: '02·03' },
  { href: '/strategy', label: 'Strategy', icon: Target, ready: true, pdf: '04' },
  { href: '/foreign', label: 'Foreign Investment', icon: Globe, ready: true, pdf: '07·08' },
  { href: '/chilean-stocks', label: 'Chilean Stocks', icon: Building2, ready: true, pdf: '05·06' },
  { href: '/distributors', label: 'Distributors', icon: Users, ready: true, pdf: '09' },
  { href: '/managers', label: 'Managers', icon: UserCog, ready: true, pdf: '10' },
];

const ADMIN_NAV: { href: string; label: string; icon: typeof BarChart3 }[] = [
  { href: '/admin/data-sources', label: 'Data Sources', icon: Layers },
];

const STORAGE_KEY = 'sidebar:collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true);
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  if (pathname === '/login') return null;
  return (
    <aside
      className={cn(
        'shrink-0 border-r border-border bg-sidebar h-screen sticky top-0 flex flex-col transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn(
          'relative pt-6 pb-6',
          collapsed ? 'px-2 flex justify-center' : 'px-6',
        )}
      >
        {collapsed ? null : (
          <div>
            <Image
              src="/patria-logo.png"
              alt="Patria"
              width={2540}
              height={1066}
              priority
              className="h-20 w-auto -ml-2 -my-4"
            />
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
              AFP Chile
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'rounded-md p-1 text-muted-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors',
            collapsed ? '' : 'absolute top-3 right-3',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>
      <nav className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {NAV.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
          const Icon = item.icon;
          const base = cn(
            'group flex items-center rounded-md text-sm font-medium transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2',
          );
          const sectionTag =
            item.pdf && !collapsed ? (
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
                title={collapsed ? `${item.label} — Coming soon` : 'Coming soon'}
              >
                <Icon className="h-4 w-4" />
                {!collapsed && (
                  <>
                    {item.label}
                    <span className="ml-auto inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide bg-muted/30 text-muted-foreground/60">
                      Soon
                    </span>
                  </>
                )}
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                base,
                isActive
                  ? 'bg-brand/10 text-sidebar-foreground shadow-[inset_3px_0_0_var(--brand)]'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', isActive && 'text-brand')} />
              {!collapsed && item.label}
              {sectionTag}
            </Link>
          );
        })}
      </nav>
      <div
        className={cn(
          'mt-4 pt-4 border-t border-sidebar-border space-y-0.5',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        {!collapsed ? (
          <div className="px-3 mb-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50 font-semibold">
            Admin
          </div>
        ) : null}
        {ADMIN_NAV.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2',
                isActive
                  ? 'bg-brand/10 text-sidebar-foreground shadow-[inset_3px_0_0_var(--brand)]'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', isActive && 'text-brand')} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </div>
      <div
        className={cn(
          'mt-auto py-4 border-t border-sidebar-border space-y-2',
          collapsed ? 'px-2' : 'px-6',
        )}
      >
        {!collapsed && (
          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
            <span>Quick search</span>
            <kbd className="font-mono border border-border rounded px-1 py-px bg-muted/30">
              ⌘ K
            </kbd>
          </div>
        )}
        <div
          className={cn(
            'flex gap-2',
            collapsed ? 'justify-center' : 'items-end justify-between',
          )}
        >
          {!collapsed && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-sidebar-foreground/60">
                AFP Chile Dashboard
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                v0.3 · Nov-25
              </div>
            </div>
          )}
          <form action={logout}>
            <button
              type="submit"
              title="Sign out"
              className="text-muted-foreground/60 hover:text-sidebar-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
