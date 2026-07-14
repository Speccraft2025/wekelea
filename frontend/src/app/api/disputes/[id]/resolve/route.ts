import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { adminResolveDispute } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return guard(async () => {
    const body = await req.json();
    // Accept either recipientId (new) or winnerId (legacy) for the receiving party.
    const recipientId = body.recipientId ?? body.winnerId;
    const notes = body.notes;
    if (!recipientId || !notes) return badRequest('Receiving party and resolution notes required');
    return ok(await adminResolveDispute(params.id, recipientId, notes));
  });
}
