import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// supabase.auth.getUser() is a network round-trip to Supabase Auth (us-west-2)
// on EVERY navigation, which dominates per-request latency. We cache the
// verification per auth-cookie value for a short TTL: same signed-in user
// navigating between tabs/modules skips the round-trip. A changed cookie
// (login/logout/refresh) is a different key, so it never serves a stale
// identity, and the TTL bounds revocation lag to 60s.
const AUTH_CACHE_TTL_MS = 60_000;
const authCache = new Map<string, { ok: boolean; exp: number }>();

function authCookieKey(request: NextRequest): string | null {
  const parts = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `${c.name}=${c.value}`);
  return parts.length ? parts.join(';') : null;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === '/login';

  // Fast path: recently-verified auth cookie â†’ skip the Auth API round-trip.
  const cacheKey = authCookieKey(request);
  if (cacheKey && !isLoginRoute) {
    const hit = authCache.get(cacheKey);
    if (hit && hit.ok && hit.exp > Date.now()) {
      return response;
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes session cookies if needed; sets request.user if signed in.
  const { data: { user } } = await supabase.auth.getUser();

  if (cacheKey) {
    // Opportunistic cleanup so the map doesn't grow unbounded.
    if (authCache.size > 500) authCache.clear();
    authCache.set(cacheKey, { ok: !!user, exp: Date.now() + AUTH_CACHE_TTL_MS });
  }

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Match everything except static assets, API routes, and Next.js internals.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
