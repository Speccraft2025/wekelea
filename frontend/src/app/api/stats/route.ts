import { ok, guard } from '@/lib/http';
import { getPublicStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public live counters for the landing page (no auth required).
export async function GET() {
  return guard(async () => ok(await getPublicStats()), 500);
}
