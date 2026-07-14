import { NextRequest } from 'next/server';
import { badRequest, created, ok, guard } from '@/lib/http';
import { getContracts, findUser, insertContract, insertNotification, insertAuditLog } from '@/lib/db';
import { Contract, AgreementCategory, PrivacySetting } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return guard(async () => {
    const userId = req.nextUrl.searchParams.get('userId') || undefined;
    return ok(await getContracts(userId));
  }, 500);
}

export async function POST(req: NextRequest) {
  return guard(async () => {
    const body = await req.json();
    const {
      title, category, terms, termsList, escrowAmount, eventDate,
      settlementDeadline, expirationDate, trustedSource, note,
      privacy, creatorId, counterpartyUsername,
    } = body;

    if (!title || !category || !escrowAmount || !eventDate || !creatorId) {
      return badRequest('Missing required agreement fields');
    }
    const escrow = Number(escrowAmount);
    if (isNaN(escrow) || escrow <= 0) return badRequest('Escrow amount must be greater than zero');

    let parsedTermsList: string[] = [];
    if (Array.isArray(termsList)) parsedTermsList = termsList.filter((t: string) => t.trim() !== '');
    else if (terms) parsedTermsList = [String(terms).trim()];
    if (parsedTermsList.length === 0) return badRequest('At least one objective condition/term is required');

    const mergedTerms = terms || parsedTermsList.join('; ');

    let counterpartyId: string | undefined;
    if (counterpartyUsername) {
      const cp = await findUser(String(counterpartyUsername).trim());
      if (!cp) return badRequest(`User with username "${counterpartyUsername}" not found`);
      if (cp.id === creatorId) return badRequest('You cannot challenge yourself');
      counterpartyId = cp.id;
    }

    const eventTime = new Date(eventDate).getTime();
    const contract: Contract = {
      id: 'c_' + Math.random().toString(36).substring(2, 10),
      title: String(title).trim(),
      category: category as AgreementCategory,
      terms: mergedTerms,
      termsList: parsedTermsList,
      escrowAmount: escrow,
      totalEscrow: escrow * 2,
      creatorId,
      counterpartyId,
      creatorStatus: 'PENDING_FUND',
      counterpartyStatus: 'PENDING_FUND',
      status: counterpartyId ? 'AWAITING_FUNDING' : 'AWAITING_ACCEPTANCE',
      eventDate,
      settlementDeadline: settlementDeadline || new Date(eventTime + 24 * 60 * 60 * 1000).toISOString(),
      expirationDate: expirationDate || new Date(eventTime - 60 * 60 * 1000).toISOString(),
      trustedSource: trustedSource?.trim() || undefined,
      note: note?.trim() || undefined,
      privacy: (privacy || 'Public') as PrivacySetting,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await insertContract(contract);

    if (counterpartyId) {
      await insertNotification({
        userId: counterpartyId,
        title: 'New Agreement Invitation 🤝',
        message: `You've been invited to an agreement "${saved.title}" with an escrow amount of KES ${saved.escrowAmount}. Review and accept the terms.`,
        contractId: saved.id,
        type: 'CONTRACT_INVITE',
      });
    }
    await insertAuditLog({
      contractId: saved.id,
      userId: creatorId,
      action: 'AGREEMENT_CREATED',
      details: `Agreement created by ${creatorId}. Escrow KES ${escrow}. Status: ${saved.status}`,
    });

    return created(saved);
  }, 500);
}
