import { NextRequest } from 'next/server';
import { badRequest, notFound, ok, guard } from '@/lib/http';
import { findUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return guard(async () => {
    const { phone, code } = await req.json();
    if (!phone || !code) return badRequest('Phone number and code required');
    const user = await findUser(String(phone));
    if (!user) return notFound('User not found');
    return ok({ user, token: 'simulated_jwt_token_for_' + user.id });
  }, 500);
}
