'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
};

/**
 * Compact exclusive-choice control. Used across charts and tables for things
 * like 1M/3M/YTD/1Y, USD/CLP, Monthly/YTD/LTM, By AFP/By Fund Type, etc.
 * Standardized look so every page reads the same. Size `sm` is for icon-only
 * variants (Line/Bar toggles), default is text labels.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  const padding = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1';
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            title={opt.title}
            className={cn(
              'inline-flex items-center justify-center rounded-sm text-xs font-medium transition-colors',
              padding,
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              opt.disabled &&
                'opacity-40 cursor-not-allowed hover:text-muted-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
