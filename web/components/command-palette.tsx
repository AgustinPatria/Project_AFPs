'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@base-ui/react/dialog';
import {
  BarChart3,
  Briefcase,
  Building2,
  Globe,
  PieChart,
  Search,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Item = {
  id: string;
  label: string;
  href: string;
  hint: string;
  icon: LucideIcon;
  pdf?: string;
};

const ITEMS: readonly Item[] = [
  {
    id: 'overview',
    label: 'Alternative Assets',
    href: '/',
    hint: 'AUM / NAV / Uncalled by AFP',
    icon: Briefcase,
  },
  {
    id: 'market-share',
    label: 'Market Share',
    href: '/market-share',
    hint: 'Returns, flows, contributors',
    icon: BarChart3,
    pdf: '01',
  },
  {
    id: 'asset-allocation',
    label: 'Asset Allocation',
    href: '/asset-allocation',
    hint: 'Equity / Fixed Income / Local',
    icon: PieChart,
    pdf: '02·03',
  },
  {
    id: 'strategy',
    label: 'Strategy',
    href: '/strategy',
    hint: 'Asset class peers · 12 families',
    icon: Target,
    pdf: '04',
  },
  {
    id: 'foreign',
    label: 'Foreign Investment',
    href: '/foreign',
    hint: 'By bucket · region · manager',
    icon: Globe,
    pdf: '07',
  },
  {
    id: 'chilean-stocks',
    label: 'Chilean Stocks',
    href: '/chilean-stocks',
    hint: 'Top inflows / outflows',
    icon: Building2,
    pdf: '05·06',
  },
];

/**
 * ⌘K / Ctrl+K command palette. Mounted once at the layout level; manages its
 * own open state via a global keydown listener. Navigation uses Next router
 * (no full reload), so the active fecha/tab query params reset on jump —
 * acceptable since the palette is a global "go to" not a state-preserving
 * back nav.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isModK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isModK) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ITEMS;
    return ITEMS.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.hint.toLowerCase().includes(q) ||
        (i.pdf && i.pdf.toLowerCase().includes(q)),
    );
  }, [query]);

  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(0);
  }, [filtered.length, selectedIdx]);

  function go(item: Item) {
    router.push(item.href);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) =>
        filtered.length === 0 ? 0 : (i + 1) % filtered.length,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) =>
        filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[selectedIdx];
      if (item) go(item);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-background/70 backdrop-blur-sm z-50" />
        <Dialog.Popup className="fixed left-1/2 top-[18%] -translate-x-1/2 z-50 w-[92%] max-w-xl rounded-lg border border-border bg-popover shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Go to section…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <kbd className="text-[10px] font-mono text-muted-foreground/60 border border-border rounded px-1.5 py-0.5">
              ESC
            </kbd>
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                No matches for &ldquo;{query}&rdquo;.
              </div>
            ) : (
              filtered.map((item, idx) => {
                const Icon = item.icon;
                const active = idx === selectedIdx;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => go(item)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-md px-3 py-2 transition-colors text-left',
                      active
                        ? 'bg-brand/10'
                        : 'hover:bg-muted/30',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-brand' : 'text-muted-foreground',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {item.hint}
                      </div>
                    </div>
                    {item.pdf ? (
                      <span
                        className={cn(
                          'text-[10px] font-mono tabular-nums shrink-0',
                          active ? 'text-brand' : 'text-muted-foreground/60',
                        )}
                      >
                        {item.pdf}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground/70">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="font-mono border border-border rounded px-1 py-px mr-1">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span>
                <kbd className="font-mono border border-border rounded px-1 py-px mr-1">
                  ↵
                </kbd>
                go
              </span>
            </div>
            <div>
              <kbd className="font-mono border border-border rounded px-1 py-px mr-1">
                ⌘ K
              </kbd>
              toggle
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
