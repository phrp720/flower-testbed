import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { SSE_HEADERS, createAgentEventStream } from '@/lib/agent/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET - recovery channel.
 *
 * EventSource-compatible, so it reconnects on its own. Opened only when loading
 * a conversation that is already running or awaiting approval -- another tab, or
 * a refresh mid-turn. The happy path streams over the POST instead.
 *
 * Last-Event-ID (or ?since=) replays from the ring buffer, so a reconnect does
 * not lose the events it missed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  const lastEventId =
    request.headers.get('last-event-id') ?? request.nextUrl.searchParams.get('since');
  const sinceSeq = lastEventId ? Number.parseInt(lastEventId, 10) : undefined;

  const stream = createAgentEventStream({
    conversationId: id,
    signal: request.signal,
    sinceSeq: Number.isFinite(sinceSeq) ? sinceSeq : undefined,
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
