import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isServiceError } from '@/lib/errors';
import { getConversation, getMessages, updateConversation } from '@/lib/agent/conversations';
import { generateConversationTitle, startAgentTurn } from '@/lib/agent/runtime';
import { SSE_HEADERS, createAgentEventStream } from '@/lib/agent/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST - send a message and stream the reply.
 *
 * The response is SSE over the POST itself, read client-side with fetch and a
 * stream reader. EventSource cannot do this: it only issues GET requests and
 * cannot carry a body. The separate GET stream exists purely for recovery.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  let text: string;
  let role: string | undefined;
  try {
    const body = await request.json();
    text = String(body.text ?? '');
    role = body.role;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const conversation = await getConversation(id);

    // Name the thread from its opening message, once.
    const existing = await getMessages(id);
    if (existing.length === 0 && conversation.title === 'New conversation') {
      void generateConversationTitle(text).then((title) => {
        if (title) void updateConversation(id, { title }).catch(() => {});
      });
    }
  } catch (error) {
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const stream = createAgentEventStream({
    conversationId: id,
    signal: request.signal,
    onReady: () => startAgentTurn(id, { text, role: role as never }),
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
