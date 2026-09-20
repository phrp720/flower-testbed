import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createApiToken, listApiTokens } from '@/lib/mcp/tokens';

export const runtime = 'nodejs';

// GET /api/agent/tokens - active tokens; the secrets themselves are unrecoverable
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    return NextResponse.json({ tokens: await listApiTokens() });
  } catch (error) {
    return toErrorResponse(error, 'Error listing API tokens', 'Failed to list tokens');
  }
}

// POST /api/agent/tokens - the plaintext token is returned here and never again
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { token, record } = await createApiToken(await request.json());
    return NextResponse.json({ token, record }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, 'Error creating API token', 'Failed to create token');
  }
}
