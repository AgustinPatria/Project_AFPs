import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getModuleFreshness } from '@/lib/queries-freshness';
import type { LagKind, ModuleFreshness } from '@/lib/types-freshness';

const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

// Format an ISO date string ('2026-01-31') from its parts to avoid any
// timezone shift on the server. monthYear -> 'ene 2026', full -> '8 may 2026'.
function fmtMonthYear(iso: string): string {
  const [y, m] = iso.split('-');
  return `${MONTHS_ES[Number(m) - 1] ?? m} ${y}`;
}
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS_ES[Number(m) - 1] ?? m} ${y}`;
}

const LAG_TOOLTIP: Record<LagKind, string> = {
  deliberate:
    'La Superintendencia de Pensiones publica el detalle de cartera (CHIST) con ~5 meses de rezago, por diseño regulatorio. No es un atraso de carga.',
  sp_agg: 'Cartera agregada de la SP (cuadros). Rezago de publicación ~2 meses.',
  fast: 'Patrimonio y valor cuota de la SP. Rezago ~1 mes.',
  bbg: 'Retornos de Bloomberg. Rezago ~3 meses (depende del cierre del analista).',
  ipd: 'Datos internos del pipeline IPD (Pionero/MRV).',
};

// Three visual states:
//   amber  -> is_behind: staler than its own cadence (likely a load lag, actionable)
//   slate  -> structural/expected lag (deliberate SP design, or SP/BBG/IPD within cadence)
//   emerald-> fast source within its window (effectively current)
function styleFor(row: ModuleFreshness): { bg: string; text: string; ring: string } {
  if (row.is_behind) {
    return { bg: 'bg-amber-500/10', text: 'text-amber-500', ring: 'ring-amber-500/30' };
  }
  if (row.lag_kind === 'fast') {
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/30' };
  }
  return { bg: 'bg-muted/50', text: 'text-muted-foreground', ring: 'ring-border' };
}

/**
 * Server component. Renders a small "datos a: <mes año>" pill for a module.
 *
 * - Page header: <AsOfBadge module="foreign" /> → uses the module's primary
 *   (defining) source.
 * - Mixed card: <AsOfBadge module="foreign" source="Retornos (Bloomberg)" />
 *   → that specific source, prefixed with its label.
 *
 * Renders nothing if the module/source isn't registered in v_module_freshness.
 */
export async function AsOfBadge({
  module,
  source,
  className,
}: {
  module: string;
  source?: string;
  className?: string;
}) {
  const { primary, sources } = await getModuleFreshness(module);
  const row = source ? sources.find((r) => r.source_label === source) : primary;
  if (!row || !row.as_of_date) return null;

  const style = styleFor(row);
  const tooltipLines = [
    source ? row.source_label : `Módulo: ${module}`,
    `Datos a: ${fmtMonthYear(row.as_of_date)}`,
  ];
  if (row.published_date) {
    tooltipLines.push(`Publicado el ${fmtDay(row.published_date)}`);
  }
  if (row.is_behind) {
    tooltipLines.push('');
    tooltipLines.push(
      'Posible atraso de carga: el dato es más viejo que su ciclo habitual de publicación.',
    );
  }
  tooltipLines.push('');
  tooltipLines.push(LAG_TOOLTIP[row.lag_kind]);

  const label = source
    ? `${row.source_label} · ${fmtMonthYear(row.as_of_date)}`
    : `datos a: ${fmtMonthYear(row.as_of_date)}`;

  return (
    <span
      title={tooltipLines.join('\n')}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ring-1 cursor-help select-none',
        style.bg,
        style.text,
        style.ring,
        className,
      )}
    >
      <Calendar className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
