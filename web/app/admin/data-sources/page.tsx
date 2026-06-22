import { Database, FileSpreadsheet, Pencil, Layers } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getAllDataSources } from '@/lib/queries-data-sources';
import type { SourceType } from '@/lib/types-data-sources';

export const revalidate = 60;

const SOURCE_STYLES: Record<
  SourceType,
  { label: string; icon: typeof Database; bg: string; text: string }
> = {
  AUTO: { label: 'AUTO', icon: Database, bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  EXCEL_SEED: { label: 'EXCEL', icon: FileSpreadsheet, bg: 'bg-amber-500/10', text: 'text-amber-400' },
  MANUAL: { label: 'MANUAL', icon: Pencil, bg: 'bg-sky-500/10', text: 'text-sky-400' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function SourceChip({ source }: { source: SourceType }) {
  const s = SOURCE_STYLES[source];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded',
        s.bg,
        s.text,
      )}
    >
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

export default async function Page() {
  const rows = await getAllDataSources();

  const total = rows.length;
  const byCurrent = {
    AUTO: rows.filter((r) => r.current_source === 'AUTO').length,
    EXCEL_SEED: rows.filter((r) => r.current_source === 'EXCEL_SEED').length,
    MANUAL: rows.filter((r) => r.current_source === 'MANUAL').length,
  };
  const inTransition = rows.filter(
    (r) => r.current_source === 'EXCEL_SEED',
  ).length;
  const targetAuto = rows.filter(
    (r) => r.current_source === 'EXCEL_SEED' && r.target_source === 'AUTO',
  ).length;
  const targetManual = rows.filter(
    (r) => r.current_source === 'EXCEL_SEED' && r.target_source === 'MANUAL',
  ).length;

  return (
    <main className="px-6 lg:px-8 pb-12">
      <PageHeader
        title="Data Sources"
        subtitle="Admin · provenance of every dashboard dataset"
        titleIcon={<Layers className="h-5 w-5 text-brand" />}
      />

      <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total datasets" value={total} />
        <Stat label="AUTO" value={byCurrent.AUTO} tone="ok" />
        <Stat label="EXCEL seed" value={byCurrent.EXCEL_SEED} tone="warn" />
        <Stat label="MANUAL" value={byCurrent.MANUAL} tone="info" />
        <Stat
          label="In transition"
          value={inTransition}
          tone="warn"
          hint={`${targetAuto} → AUTO  ·  ${targetManual} → MANUAL`}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">All datasets</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[10%]">PDF</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead className="w-[100px]">Current</TableHead>
                <TableHead className="w-[100px]">Target</TableHead>
                <TableHead className="w-[140px]">Excel periodo</TableHead>
                <TableHead className="w-[110px]">Last loaded</TableHead>
                <TableHead>Migration plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.dataset_key}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.pdf_section ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.display_name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {r.dataset_key}
                    </div>
                    {r.excel_seed_path ? (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        <FileSpreadsheet className="inline h-2.5 w-2.5 mr-1" />
                        {r.excel_seed_path}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <SourceChip source={r.current_source} />
                  </TableCell>
                  <TableCell>
                    <SourceChip source={r.target_source} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.excel_seed_periodo ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {fmtDate(r.last_loaded_at)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md">
                    {r.migration_plan ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'info';
  hint?: string;
}) {
  const toneClass =
    tone === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : tone === 'warn'
        ? 'border-amber-500/30 bg-amber-500/5'
        : tone === 'info'
          ? 'border-sky-500/30 bg-sky-500/5'
          : 'border-border bg-background';
  return (
    <div className={cn('rounded-md border p-3', toneClass)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-semibold mt-0.5 tabular-nums">{value}</div>
      {hint ? (
        <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
      ) : null}
    </div>
  );
}
