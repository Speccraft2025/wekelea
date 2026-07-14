import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the service_role key.
 * Bypasses RLS — use ONLY inside API route handlers, never in the browser.
 */
let adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.'
    );
  }

  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // supabase-js uses fetch under the hood; Next.js caches fetch by default,
      // which would serve stale reads. Force every request to bypass the cache.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return adminClient;
}

/** True when the server has enough config to talk to Supabase. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
