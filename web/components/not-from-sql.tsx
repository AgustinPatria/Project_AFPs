import type { ReactNode } from 'react';

/**
 * Marca una card/visualización cuyo dato AÚN no proviene de SQL como fuente única
 * (la migración de esa pieza quedó pendiente — ej. seeds de Sec05, mapeo manual de
 * distribuidor, overlays curados a mano). Gris-ea el contenido y muestra una
 * etiqueta sobre el borde superior, para que se vea de un vistazo qué falta migrar.
 *
 * Espejo del lineage (lineage-interactive.html): los nodos "pendiente" se pintan
 * en gris con borde punteado naranja. Acá usamos el mismo código de color.
 */
export function NotFromSql({
  children,
  reason,
}: {
  children: ReactNode;
  reason?: string;
}) {
  return (
    <div className="relative rounded-xl ring-1 ring-orange-200/70">
      <div className="grayscale opacity-70">{children}</div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        <span
          className="-translate-y-1/2 rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700 shadow-sm"
          title={
            reason ??
            'Estos datos aún no provienen de SQL como fuente única (migración pendiente).'
          }
        >
          ⚠ No desde SQL
        </span>
      </div>
    </div>
  );
}
