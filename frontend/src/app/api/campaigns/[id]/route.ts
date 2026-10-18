import { notFound, ok, guard } from '@/lib/http';
import { getCampaign, getSubmissions } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return guard(async () => {
    const campaign = await getCampaign(params.id);
    if (!campaign) return notFound('Campaign not found');
    const submissions = await getSubmissions({ campaignId: params.id });
    return ok({ campaign, submissions });
  }, 500);
}
