import { notFound, ok, guard } from '@/lib/http';
import { findUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return guard(async () => {
    const user = await findUser(params.id);
    if (!user) return notFound('User not found');
    return ok(user);
  }, 500);
}
