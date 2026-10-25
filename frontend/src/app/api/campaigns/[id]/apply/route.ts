import { NextRequest } from 'next/server';
import { badRequest, created, guard } from '@/lib/http';
import { applyToCampaign } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return guard(async () => {
    const { userId, note } = await req.json();
    if (!userId) return badRequest('User ID is required');
    if (!String(note ?? '').trim()) return badRequest('Tell the artist why you are a fit for this campaign');
    return created(await applyToCampaign(params.id, userId, String(note).trim()));
  });
}
