import { login } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const { error, redirect } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            <div className="text-xl font-bold tracking-[0.22em] leading-none">
              PATRIA
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
            AFP Chile Dashboard
          </div>
        </div>

        <form action={login} className="space-y-3 rounded-lg border border-border bg-card p-6">
          <input type="hidden" name="redirect" value={redirect ?? '/'} />
          <div className="space-y-1">
            <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          {error ? (
            <p className="text-xs text-red-500" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-[10px] text-center text-muted-foreground/60">
          Internal access only · Moneda Asset Management
        </p>
      </div>
    </main>
  );
}
