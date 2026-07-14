import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { withdrawFunds } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return guard(async () => {
    const { amount } = await req.json();
    const value = Number(amount);
    if (isNaN(value) || value <= 0) return badRequest('Invalid withdrawal amount');
    const user = await withdrawFunds(params.id, value);
    return ok({ success: true, user });
  });
}
