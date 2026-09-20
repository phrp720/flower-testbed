import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { cancelAgentTurn } from '@/lib/agent/runtime';

export const runtime = 'nodejs';

// POST - stop the in-flight turn. Separate from the request that started it,
// which is why the loop tracks its AbortController centrally.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    return NextResponse.json({ cancelled: cancelAgentTurn(id) });
  } catch (error) {
    return toErrorResponse(error, 'Error cancelling turn', 'Failed to cancel');
  }
}
