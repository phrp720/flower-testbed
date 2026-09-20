import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { parseExperimentIdParam } from '@/lib/experiment-id';
import { buildExperimentSnapshot } from '@/lib/experiments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/experiments/:id/stream - Server-Sent Events for real-time updates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const experimentId = parseExperimentIdParam(id);

  if (!experimentId) {
    return new Response('Invalid experiment ID', { status: 400 });
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const shutdown = () => {
        if (closed) return;
        closed = true;
        clearInterval(intervalId);
        clearInterval(keepAliveId);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime; nothing to do.
        }
      };

      // Poll for updates every 2 seconds
      const intervalId = setInterval(async () => {
        try {
          const snapshot = await buildExperimentSnapshot(experimentId);

          if (!snapshot) {
            shutdown();
            return;
          }

          sendEvent(snapshot);

          // Stop if experiment is completed or failed
          if (
            snapshot.experiment.status === 'completed' ||
            snapshot.experiment.status === 'failed'
          ) {
            sendEvent({ status: 'complete', final: true });
            shutdown();
          }
        } catch (error) {
          console.error('Stream error:', error);
          shutdown();
        }
      }, 2000);

      // Comment frame: keeps intermediaries from dropping an idle connection.
      const keepAliveId = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      // Clean up on client disconnect
      request.signal.addEventListener('abort', shutdown);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
