import { ok, guard } from '@/lib/http';
import { getTransactions } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return guard(async () => ok(await getTransactions(params.id)), 500);
}
