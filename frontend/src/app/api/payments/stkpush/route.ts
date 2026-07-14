import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { initiateSTKPush, isDarajaConfigured } from '@/lib/mpesa';
import { createPendingDeposit } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return guard(async () => {
    const { phone, amount, contractId, userId } = await req.json();
    if (!phone || !amount || !contractId || !userId) {
      return badRequest('Missing checkout parameters');
    }

    const stk = await initiateSTKPush({ phone, amount: Number(amount), contractId, userId });

    // Record the PENDING deposit keyed by CheckoutRequestID so the callback can
    // find and confirm it later (works for both real Daraja and simulated mode).
    await createPendingDeposit(userId, Number(amount), stk.CheckoutRequestID, contractId);

    // Tell the client which flow to run: real Daraja (prompt on phone → wait for
    // callback) vs. simulated (client auto-confirms).
    return ok({ ...stk, simulated: !isDarajaConfigured() });
  }, 500);
}
