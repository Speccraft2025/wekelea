import { NextRequest } from 'next/server';
import { badRequest, ok, guard } from '@/lib/http';
import { findUser, createUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return guard(async () => {
    const { phone } = await req.json();
    if (!phone) return badRequest('Phone number is required');

    let formatted = String(phone).trim().replace(/\D/g, '');
    if (formatted.startsWith('0')) formatted = '254' + formatted.substring(1);
    else if (formatted.startsWith('+')) formatted = formatted.substring(1);
    if (!formatted.startsWith('254') && formatted.length === 9) formatted = '254' + formatted;

    let user = await findUser(formatted);
    if (!user) {
      const username = 'User_' + formatted.substring(formatted.length - 4);
      user = await createUser({
        id: 'u_' + Math.random().toString(36).substring(2, 10),
        phone: formatted,
        username,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
        trustScore: 90,
        contractsCompleted: 0,
        winStreak: 0,
        walletBalance: 0,
      });
    }
    return ok({ user, token: 'simulated_jwt_token_for_' + user.id });
  }, 500);
}
