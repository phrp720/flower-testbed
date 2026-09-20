import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { revokeApiToken } from '@/lib/mcp/tokens';

export const runtime = 'nodejs';

// DELETE /api/agent/tokens/[id] - revoke
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    await revokeApiToken(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error, 'Error revoking API token', 'Failed to revoke token');
  }
}
