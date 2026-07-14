import { NextRequest, NextResponse } from 'next/server';
import { badRequest, notFound, ok, guard } from '@/lib/http';
import { parseCallback } from '@/lib/mpesa';
import { confirmDeposit } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Handles both:
 *   • Real Daraja STK callback (Safaricom → this URL) — must ack with ResultCode 0
 *   • Simulated callback from the frontend — returns { success, transaction }
 */
export async function POST(req: NextRequest) {
  return guard(async () => {
    const payload = await req.json();
    const isRealDaraja = Boolean(payload?.Body?.stkCallback);

    const parsed = parseCallback(payload);
    if (!parsed) return badRequest('Checkout request ID is required');

    const mpesaRef = parsed.mpesaReceipt || 'MPESA_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const tx = await confirmDeposit(parsed.checkoutRequestId, parsed.success, mpesaRef);

    // Always acknowledge Safaricom so it stops retrying, even if we can't match the tx.
    if (isRealDaraja) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (!tx) return notFound('Pending transaction matching checkout ID not found');
    return ok({ success: true, transaction: tx });
  }, 500);
}
