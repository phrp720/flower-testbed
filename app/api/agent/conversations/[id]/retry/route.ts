import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isServiceError } from '@/lib/errors';
import { getConversation } from '@/lib/agent/conversations';
import { retryAgentTurn } from '@/lib/agent/runtime';
import { SSE_HEADERS, createAgentEventStream } from '@/lib/agent/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST - run the last turn again.
 *
 * Deliberately the same shape as the messages route, streaming SSE over the
 * POST, because the client consumes both with the same reader. The difference
 * is only that nothing new is appended: the message that failed is already in
 * the transcript and is simply driven again.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  // Validated before the stream opens, so a refusal is a plain JSON error the
  // client can show rather than an error event inside a 200 response.
  try {
    await getConversation(id);
  } catch (error) {
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const stream = createAgentEventStream({
    conversationId: id,
    signal: _request.signal,
    onReady: () => retryAgentTurn(id),
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
