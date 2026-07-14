import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { adminRefundDispute } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return guard(async () => {
    const { notes } = await req.json();
    if (!notes) return badRequest('Resolution notes required');
    return ok(await adminRefundDispute(params.id, notes));
  });
}
