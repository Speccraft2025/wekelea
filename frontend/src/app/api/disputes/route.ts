import { ok, guard } from '@/lib/http';
import { getDisputes } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guard(async () => ok(await getDisputes()), 500);
}
