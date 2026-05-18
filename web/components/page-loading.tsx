// Skeleton shown while a route's Server Component is fetching data.
// Mimics the standard page structure: header + KPI grid + cards.

export function PageLoading() {
  return (
    <main className="p-6 lg:p-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-64 rounded bg-muted/40" />
        <div className="h-3 w-48 rounded bg-muted/30" />
      </div>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-6 space-y-3">
            <div className="h-3 w-24 rounded bg-muted/40" />
            <div className="h-8 w-32 rounded bg-muted/50" />
            <div className="h-3 w-20 rounded bg-muted/30" />
          </div>
        ))}
      </section>

      <div className="rounded-lg border border-border bg-card p-6 space-y-3">
        <div className="h-4 w-48 rounded bg-muted/40" />
        <div className="h-64 rounded bg-muted/20" />
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-3">
        <div className="h-4 w-40 rounded bg-muted/40" />
        <div className="h-48 rounded bg-muted/20" />
      </div>
    </main>
  );
}
