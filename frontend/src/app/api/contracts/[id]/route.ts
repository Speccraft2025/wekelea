import { notFound, ok, guard } from '@/lib/http';
import { getContract } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return guard(async () => {
    const contract = await getContract(params.id);
    if (!contract) return notFound('Contract not found');
    return ok(contract);
  }, 500);
}
