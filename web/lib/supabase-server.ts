import 'server-only';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.',
  );
}

// Every PostgREST read goes through Next's Data Cache: GET responses are
// cached for REVALIDATE_S seconds and shared across requests and navigations,
// so switching tabs/modules doesn't re-hit Supabase (us-west-2, ~250ms RTT)
// for data that changes once a month. Mutations (POST/PATCH/DELETE) are never
// cached by the fetch cache. Admin server actions must call
// revalidateTag(SUPABASE_CACHE_TAG) after writing so their edits show up
// immediately instead of after the TTL.
export const SUPABASE_CACHE_TAG = 'supabase';
const REVALIDATE_S = 300;

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        next: { revalidate: REVALIDATE_S, tags: [SUPABASE_CACHE_TAG] },
      }),
  },
});
