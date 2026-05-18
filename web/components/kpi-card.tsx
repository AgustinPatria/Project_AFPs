import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { fmtSignedPct, fmtUsdMM } from '@/lib/format';

export function KpiCard({
  label,
  value,
  prev,
  unit = 'USD MM',
  icon: Icon,
  sparkline,
}: {
  label: string;
  value: number;
  prev?: number | null;
  unit?: string;
  icon?: LucideIcon;
  sparkline?: number[];
}) {
  const delta = prev != null && prev > 0 ? (value - prev) / prev : null;
  const isUp = delta != null && delta >= 0;

  return (
    <Card className="transition-colors hover:bg-card/70 hover:border-border/80">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        {Icon ? (
          <Icon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">
          {fmtUsdMM(value)}
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-xs">
          {delta != null ? (
            <>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
                  isUp
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-red-500/15 text-red-400',
                )}
              >
                {isUp ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {fmtSignedPct(delta)}
              </span>
              <span className="text-muted-foreground">vs prev. month</span>
            </>
          ) : (
            <span className="text-muted-foreground">{unit}</span>
          )}
        </div>
        <Sparkline data={sparkline} isUp={isUp} />
      </CardContent>
    </Card>
  );
}

function Sparkline({ data, isUp }: { data?: number[]; isUp: boolean }) {
  if (!data || data.length < 2) {
    return <div className="mt-3 h-7" aria-hidden />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const step = w / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const color = isUp ? 'oklch(0.75 0.18 155)' : 'oklch(0.70 0.20 25)';
  const gradId = `spark-grad-${isUp ? 'up' : 'down'}`;
  return (
    <div className="mt-3 h-7">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          fill={`url(#${gradId})`}
          points={`0,${h} ${points} ${w},${h}`}
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
