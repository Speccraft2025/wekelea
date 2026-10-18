import { NextRequest } from 'next/server';
import { badRequest, created, ok, guard } from '@/lib/http';
import { getCampaigns, insertCampaign, insertAuditLog } from '@/lib/db';
import { Campaign, AgreementCategory, CampaignPlatform, PrivacySetting } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return guard(async () => {
    const sponsorId = req.nextUrl.searchParams.get('sponsorId') || undefined;
    return ok(await getCampaigns({ sponsorId }));
  }, 500);
}

export async function POST(req: NextRequest) {
  return guard(async () => {
    const body = await req.json();
    const {
      title, brief, category, platform, requirements, ratePer1000, minViews,
      budget, deadline, trustedSource, privacy, sponsorId,
    } = body;

    if (!title || !platform || !sponsorId) {
      return badRequest('Missing required campaign fields');
    }
    const rate = Number(ratePer1000);
    if (isNaN(rate) || rate <= 0) return badRequest('Rate per 1,000 views must be greater than zero');
    const total = Number(budget);
    if (isNaN(total) || total <= 0) return badRequest('Budget must be greater than zero');
    if (total < rate) return badRequest('Budget must be at least one payout tier (rate per 1,000 views)');

    let reqs: string[] = [];
    if (Array.isArray(requirements)) reqs = requirements.filter((t: string) => String(t).trim() !== '');
    if (reqs.length === 0) return badRequest('At least one deliverable requirement is required');

    const campaign: Campaign = {
      id: 'cmp_' + Math.random().toString(36).substring(2, 10),
      sponsorId,
      title: String(title).trim(),
      brief: String(brief ?? '').trim(),
      category: (category || 'Creative Work') as AgreementCategory,
      platform: platform as CampaignPlatform,
      requirements: reqs,
      ratePer1000: rate,
      minViews: Math.max(0, Number(minViews) || 0),
      budget: total,
      budgetRemaining: 0,
      status: 'AWAITING_FUNDING',
      deadline: deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trustedSource: trustedSource?.trim() || undefined,
      privacy: (privacy || 'Public') as PrivacySetting,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await insertCampaign(campaign);
    await insertAuditLog({
      contractId: saved.id,
      userId: sponsorId,
      action: 'CAMPAIGN_CREATED',
      details: `Campaign created by ${sponsorId}. Budget KES ${total}, rate KES ${rate}/1k views. Status: ${saved.status}`,
    });
    return created(saved);
  }, 500);
}
