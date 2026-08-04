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

  // NOTE: do NOT wrap fetch with `cache: 'no-store'` here — that breaks undici's
  // fetch in Netlify's Lambda runtime ("TypeError: fetch failed"). Fresh reads are
  // guaranteed instead by `export const dynamic = 'force-dynamic'` on every route,
  // which forces all fetches in the handler to bypass Next.js's data cache.
  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** True when the server has enough config to talk to Supabase. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
