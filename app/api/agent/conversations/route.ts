import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createConversation, listConversations } from '@/lib/agent/conversations';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    return NextResponse.json({ conversations: await listConversations() });
  } catch (error) {
    return toErrorResponse(error, 'Error listing conversations', 'Failed to list conversations');
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const conversation = await createConversation(body);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, 'Error creating conversation', 'Failed to create conversation');
  }
}
