import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { disputeRelease } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return guard(async () => {
    const { userId, reason } = await req.json();
    if (!userId || !reason) return badRequest('User ID and reason required');
    return ok(await disputeRelease(params.id, userId, reason));
  });
}
