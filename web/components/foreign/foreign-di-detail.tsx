'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtUsdMM } from '@/lib/format';
import type { DiRow } from '@/lib/queries-foreign-di';
import { cn } from '@/lib/utils';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMonYY(fechaValor: string | null): string {
  if (!fechaValor) return '—';
  const [y, m] = fechaValor.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]}-${(y % 100).toString().padStart(2, '0')}`;
}

type Props = {
  fechas: { label: string; fecha_valor: string | null }[];
  rows: DiRow[];
};

const COUNTRY_ORDER = ['U.S.', 'Mexico', 'Brazil', 'Colombia', 'Spain'];
const CURRENCY_ORDER = ['USD', 'MXN', 'BRL', 'EUR'];

export function ForeignDirectInvestmentDetail({ fechas, rows }: Props) {
  // Index rows by fecha_valor so each cell can be O(1) summed.
  const byFecha = new Map<string, DiRow[]>();
  for (const r of rows) {
    if (!byFecha.has(r.fecha_valor)) byFecha.set(r.fecha_valor, []);
    byFecha.get(r.fecha_valor)!.push(r);
  }

  function sumWhere(
    fechaValor: string | null,
    pred: (r: DiRow) => boolean,
  ): number {
    if (!fechaValor) return 0;
    const list = byFecha.get(fechaValor);
    if (!list) return 0;
    let s = 0;
    for (const r of list) if (pred(r)) s += r.usd_mm;
    return s;
  }

  function fmtCell(v: number, hasFecha: boolean): string {
    if (!hasFecha) return '—';
    if (Math.round(v) === 0) return '—';
    return fmtUsdMM(v);
  }

  // Country/Currency tables fold tail buckets into "Other" so they match the PDF.
  function rowsCountry(label: string, fechaValor: string | null): number {
    if (label === 'Other') {
      return sumWhere(
        fechaValor,
        (r) =>
          r.di_category === 'Sovereign' &&
          (r.country == null || !COUNTRY_ORDER.includes(r.country)),
      );
    }
    return sumWhere(
      fechaValor,
      (r) => r.di_category === 'Sovereign' && r.country === label,
    );
  }
  function rowsCurrency(label: string, fechaValor: string | null): number {
    if (label === 'Other') {
      return sumWhere(
        fechaValor,
        (r) =>
          r.di_category === 'Sovereign' &&
          (r.currency == null || !CURRENCY_ORDER.includes(r.currency)),
      );
    }
    return sumWhere(
      fechaValor,
      (r) => r.di_category === 'Sovereign' && r.currency === label,
    );
  }

  const cols = fechas;

  function ColHeaders() {
    return (
      <TableRow>
        <TableHead />
        {cols.map((c) => (
          <TableHead key={c.label} className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground">
              {c.label}
            </div>
            <div>{fmtMonYY(c.fecha_valor)}</div>
          </TableHead>
        ))}
      </TableRow>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table 1 — Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Foreign Direct Investment (USD mm)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <ColHeaders />
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Fixed Income</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.label} className="text-right tabular-nums">
                    {fmtCell(
                      sumWhere(c.fecha_valor, (r) => r.asset_class === 'Fixed Income'),
                      !!c.fecha_valor,
                    )}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell>Equity</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.label} className="text-right tabular-nums">
                    {fmtCell(
                      sumWhere(c.fecha_valor, (r) => r.asset_class === 'Equity'),
                      !!c.fecha_valor,
                    )}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
                <TableCell>Foreign Direct Investment</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.label} className="text-right tabular-nums">
                    {fmtCell(
                      sumWhere(c.fecha_valor, () => true),
                      !!c.fecha_valor,
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Table 2 — FI Direct Investment by category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Foreign Fixed Income (Direct Inv.) by category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <ColHeaders />
            </TableHeader>
            <TableBody>
              {(['Sovereign', 'Bank', 'Corporate'] as const).map((cat) => (
                <TableRow key={cat}>
                  <TableCell>{cat}</TableCell>
                  {cols.map((c) => (
                    <TableCell key={c.label} className="text-right tabular-nums">
                      {fmtCell(
                        sumWhere(
                          c.fecha_valor,
                          (r) =>
                            r.asset_class === 'Fixed Income' &&
                            r.di_category === cat,
                        ),
                        !!c.fecha_valor,
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
                <TableCell>Foreign Fixed Income (Direct Inv.)</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.label} className="text-right tabular-nums">
                    {fmtCell(
                      sumWhere(c.fecha_valor, (r) => r.asset_class === 'Fixed Income'),
                      !!c.fecha_valor,
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Table 3 — Sovereign bonds by country */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Sovereign Bonds by Country (USD mm)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <ColHeaders />
            </TableHeader>
            <TableBody>
              {[...COUNTRY_ORDER, 'Other'].map((country) => (
                <TableRow key={country}>
                  <TableCell>{country}</TableCell>
                  {cols.map((c) => (
                    <TableCell key={c.label} className="text-right tabular-nums">
                      {fmtCell(rowsCountry(country, c.fecha_valor), !!c.fecha_valor)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
                <TableCell>Total Sovereign Bonds (Direct Inv.)</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.label} className="text-right tabular-nums">
                    {fmtCell(
                      sumWhere(c.fecha_valor, (r) => r.di_category === 'Sovereign'),
                      !!c.fecha_valor,
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Table 4 — Sovereign bonds by currency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Sovereign Bonds by Currency (USD mm)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <ColHeaders />
            </TableHeader>
            <TableBody>
              {[...CURRENCY_ORDER, 'Other'].map((cur) => (
                <TableRow key={cur}>
                  <TableCell>{cur}</TableCell>
                  {cols.map((c) => (
                    <TableCell key={c.label} className="text-right tabular-nums">
                      {fmtCell(rowsCurrency(cur, c.fecha_valor), !!c.fecha_valor)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-t-brand/60 bg-muted/40 font-semibold">
                <TableCell>Total Sovereign Bonds (Direct Inv.)</TableCell>
                {cols.map((c) => (
                  <TableCell key={c.label} className="text-right tabular-nums">
                    {fmtCell(
                      sumWhere(c.fecha_valor, (r) => r.di_category === 'Sovereign'),
                      !!c.fecha_valor,
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
