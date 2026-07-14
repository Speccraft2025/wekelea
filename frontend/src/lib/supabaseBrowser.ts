'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client using the anon key — used only to subscribe to
 * Realtime postgres changes (live contract / notification / dispute updates).
 * All data mutations go through the /api routes, never directly from here.
 */
let browserClient: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Realtime is a progressive enhancement on top of polling; if it isn't
  // configured we simply return null and the app keeps working via polling.
  if (!url || !anonKey) return null;

  if (browserClient) return browserClient;
  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return browserClient;
}
