import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { getSubmissions } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Submissions for a creator across all campaigns (creator's own feed).
export async function GET(req: NextRequest) {
  return guard(async () => {
    const creatorId = req.nextUrl.searchParams.get('creatorId') || undefined;
    if (!creatorId) return badRequest('creatorId is required');
    return ok(await getSubmissions({ creatorId }));
  }, 500);
}
