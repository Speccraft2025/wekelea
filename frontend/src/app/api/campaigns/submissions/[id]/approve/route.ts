import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { approveSubmission } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return guard(async () => {
    const { userId, verifiedViews, notes } = await req.json();
    if (!userId) return badRequest('User ID is required');
    const views = Number(verifiedViews);
    if (isNaN(views) || views < 0) return badRequest('Verified views must be zero or more');
    return ok(await approveSubmission(params.id, userId, Math.floor(views), String(notes ?? '')));
  });
}
