import { ok, guard } from '@/lib/http';
import { markNotificationsRead } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return guard(async () => {
    await markNotificationsRead(params.id);
    return ok({ success: true });
  }, 500);
}
