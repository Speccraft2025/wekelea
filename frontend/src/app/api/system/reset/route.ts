import { ok, guard } from '@/lib/http';
import { resetDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  return guard(async () => {
    await resetDatabase();
    return ok({ success: true, message: 'Database reset to initial seed values' });
  }, 500);
}
