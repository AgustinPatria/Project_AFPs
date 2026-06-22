import { Database, FileSpreadsheet, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDataSource } from '@/lib/queries-data-sources';
import type { SourceType } from '@/lib/types-data-sources';

const STYLES: Record<
  SourceType,
  { label: string; icon: typeof Database; bg: string; text: string; ring: string }
> = {
  AUTO: {
    label: 'AUTO',
    icon: Database,
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    ring: 'ring-emerald-500/30',
  },
  EXCEL_SEED: {
    label: 'EXCEL',
    icon: FileSpreadsheet,
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    ring: 'ring-amber-500/30',
  },
  MANUAL: {
    label: 'MANUAL',
    icon: Pencil,
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    ring: 'ring-sky-500/30',
  },
};

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diffMs = Date.now() - ts;
  const day = 86_400_000;
  if (diffMs < day) return 'today';
  const days = Math.floor(diffMs / day);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

// Server component — fetches dataset metadata from Supabase. Renders a small
// pill in the top-right of whatever container holds it. The title attribute
// surfaces the migration plan + last-loaded info on hover for non-technical
// readers who want to understand why this dataset is in EXCEL_SEED state.
export async function SourceBadge({
  dataset,
  className,
}: {
  dataset: string;
  className?: string;
}) {
  const row = await getDataSource(dataset);
  if (!row) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded ring-1 ring-red-500/30 bg-red-500/10 text-red-400',
          className,
        )}
        title={`Unknown dataset: ${dataset}. Register it in dim_data_sources.`}
      >
        ?
      </span>
    );
  }
  const style = STYLES[row.current_source];
  const Icon = style.icon;
  const tooltipLines: string[] = [
    row.display_name,
    `Current: ${row.current_source}`,
    `Target: ${row.target_source}`,
  ];
  if (row.excel_seed_path) {
    tooltipLines.push(`Excel: ${row.excel_seed_path}`);
  }
  if (row.excel_seed_periodo) {
    tooltipLines.push(`Periodo: ${row.excel_seed_periodo}`);
  }
  if (row.last_loaded_at) {
    tooltipLines.push(`Loaded: ${fmtRelative(row.last_loaded_at)}`);
  }
  if (row.migration_plan) {
    tooltipLines.push('');
    tooltipLines.push(`Plan: ${row.migration_plan}`);
  }
  const tooltip = tooltipLines.join('\n');

  const label =
    row.current_source === 'EXCEL_SEED' && row.excel_seed_periodo
      ? `EXCEL · ${row.excel_seed_periodo}`
      : style.label;

  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded ring-1 cursor-help select-none',
        style.bg,
        style.text,
        style.ring,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
