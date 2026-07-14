import { ok, guard } from '@/lib/http';
import { getUsers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guard(async () => ok(await getUsers()), 500);
}
