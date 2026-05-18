import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Placeholder card for features that aren't ready yet. The status pill makes
 * it explicit that this is intentional (waiting on a dep / data / decision),
 * not a bug. Use `status` for short ETAs like "ETA Q2 2026" or "AWAITING DATA".
 */
export function ComingSoon({
  icon: Icon,
  title,
  status = 'COMING SOON',
  description,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  status?: string;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('border-dashed bg-card/40', className)}>
      <CardContent className="flex items-start gap-4 py-6">
        {Icon ? (
          <div className="rounded-md border border-border bg-muted/30 p-2 text-muted-foreground/70 shrink-0">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground/90">
              {title}
            </h3>
            <span className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              {status}
            </span>
          </div>
          {description ? (
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {description}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
