import { NextRequest } from 'next/server';
import { badRequest, created, guard } from '@/lib/http';
import { submitToCampaign } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return guard(async () => {
    const { userId, postUrl, proofLink, claimedViews, note } = await req.json();
    if (!userId) return badRequest('User ID is required');
    if (!postUrl || String(postUrl).trim() === '') return badRequest('A link to your published post is required');
    const sub = await submitToCampaign(
      params.id, userId, String(postUrl).trim(),
      String(proofLink ?? ''), Math.max(0, Number(claimedViews) || 0), String(note ?? ''),
    );
    return created(sub);
  });
}
