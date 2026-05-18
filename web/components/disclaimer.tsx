import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  /** Pre-built variants for common disclaimers across sections. */
  variant?: 'data-sources' | 'foreign-lag' | 'sp-only';
  /** Free-form override. If provided, replaces the variant body. */
  children?: React.ReactNode;
  className?: string;
};

const VARIANTS: Record<NonNullable<Props['variant']>, React.ReactNode> = {
  'data-sources': (
    <>
      <strong>Data sources.</strong> AUM, returns and flows by AFP × fund type are
      derived from <code>valores_cuota_patrimonio</code> (daily AFP NAVs, no lag).
      USD conversion uses the Bloomberg interbank rate (<code>USDCLP Curncy</code>).
      Returns and flows over multi-month windows compound monthly values.
    </>
  ),
  'foreign-lag': (
    <>
      <strong>Foreign Investment data.</strong> Detailed holdings come from the
      regulatory filing (CHIST) which is published with a 4-month delay. The most
      recent 4 months are covered by the SP aggregated XML (no lag) but at a
      coarser granularity. The view will switch source automatically based on the
      selected period.
    </>
  ),
  'sp-only': (
    <>
      <strong>Source.</strong> Aggregate cartera data published by the
      Superintendencia de Pensiones (no lag). Limited to system-level breakdown —
      individual instruments only available via CHIST (4-month delay).
    </>
  ),
};

export function Disclaimer({ variant = 'data-sources', children, className }: Props) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground',
        className,
      )}
    >
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children ?? VARIANTS[variant]}</div>
    </div>
  );
}
