import type { AgentEvent, BufferedEvent } from './events';
import { subscribeAgentEvents } from './events';

/**
 * Serialising agent events as SSE.
 *
 * Named events are used here, unlike the experiment stream, which sends a whole
 * snapshot every tick and so needs no discriminator. A turn emits eight-odd
 * kinds of event, and naming them saves the client parsing a union on every frame.
 */

const KEEPALIVE_MS = 15000;

export function formatSseFrame(buffered: BufferedEvent): string {
  return [
    `id: ${buffered.seq}`,
    `event: ${buffered.event.type}`,
    `data: ${JSON.stringify(buffered.event)}`,
    '',
    '',
  ].join('\n');
}

export interface AgentStreamOptions {
  conversationId: string;
  signal: AbortSignal;
  sinceSeq?: number;
  /** Runs once the subscription is live, so no event emitted by it is missed. */
  onReady?: () => Promise<void> | void;
}

export function createAgentEventStream(options: AgentStreamOptions): ReadableStream<Uint8Array> {
  const { conversationId, signal, sinceSeq, onReady } = options;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      const push = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close();
        }
      };

      const unsubscribe = subscribeAgentEvents(
        conversationId,
        (buffered) => {
          push(formatSseFrame(buffered));
          // A turn ending is the natural end of the stream.
          if (buffered.event.type === 'turn_end') close();
        },
        sinceSeq != null ? { sinceSeq } : {}
      );

      // Comment frame; keeps intermediaries from dropping an idle connection.
      const keepAlive = setInterval(() => push(': ping\n\n'), KEEPALIVE_MS);

      signal.addEventListener('abort', close);

      // Subscribed before this runs, so nothing it emits can be lost.
      if (onReady) {
        try {
          await onReady();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to start the turn.';
          const event: AgentEvent = { type: 'error', message };
          push(`event: error\ndata: ${JSON.stringify(event)}\n\n`);
          push(`event: turn_end\ndata: ${JSON.stringify({ type: 'turn_end', reason: 'error' })}\n\n`);
          close();
        }
      }
    },
  });
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;
