import { NextRequest } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

// GET /api/experiments/:id/stream - Server-Sent Events for real-time updates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const experimentId = parseInt(id);

  if (isNaN(experimentId)) {
    return new Response('Invalid experiment ID', { status: 400 });
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Function to send SSE message
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll for updates every 2 seconds
      const intervalId = setInterval(async () => {
        try {
          // Fetch experiment status
          const [experiment] = await db
            .select()
            .from(schema.experiments)
            .where(eq(schema.experiments.id, experimentId));

          if (!experiment) {
            clearInterval(intervalId);
            controller.close();
            return;
          }

          // Fetch latest metrics
          const metrics = await db
            .select()
            .from(schema.metrics)
            .where(eq(schema.metrics.experimentId, experimentId))
            .orderBy(desc(schema.metrics.round))
            .limit(1);

          const latestMetrics = metrics[0] || null;

          // Send update
          sendEvent({
            experiment: {
              id: experiment.id,
              name: experiment.name,
              status: experiment.status,
              currentRound: latestMetrics?.round || 0,
              totalRounds: experiment.numRounds,
            },
            metrics: latestMetrics ? {
              round: latestMetrics.round,
              trainLoss: latestMetrics.trainLoss,
              trainAccuracy: latestMetrics.trainAccuracy,
              evalLoss: latestMetrics.evalLoss,
              evalAccuracy: latestMetrics.evalAccuracy,
            } : null,
          });

          // Stop if experiment is completed or failed
          if (experiment.status === 'completed' || experiment.status === 'failed') {
            clearInterval(intervalId);
            // Send final update
            sendEvent({ status: 'complete', final: true });
            controller.close();
          }
        } catch (error) {
          console.error('Stream error:', error);
          clearInterval(intervalId);
          controller.close();
        }
      }, 2000);

      // Clean up on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(intervalId);
        controller.close();
      });
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