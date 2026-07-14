import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { acceptContract } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return guard(async () => {
    const { userId } = await req.json();
    if (!userId) return badRequest('User ID is required');
    return ok(await acceptContract(params.id, userId));
  });
}
