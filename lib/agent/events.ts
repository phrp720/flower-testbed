/**
 * In-process event bus for streaming a turn to the browser.
 *
 * The agent loop runs detached from the HTTP request that started it, so a tab
 * closing mid-tool-call cannot abort it. The stream endpoints subscribe here.
 *
 * A small ring buffer per conversation lets a reconnecting client catch up on
 * what it missed. Postgres remains the source of truth -- losing the stream
 * costs the token-by-token animation, never a message.
 *
 * This is single-process, which suits the testbed's single container. Scaling to
 * several processes means replacing the bus with Postgres LISTEN/NOTIFY; nothing
 * outside this file would change.
 */

export type AgentEvent =
  | { type: 'turn_start'; conversationId: string; role: string }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'message'; messageId: string; role: string; kind: string; content: unknown }
  | { type: 'tool_call'; toolCallId: string; toolName: string; input: unknown; risk: string }
  | { type: 'tool_result'; toolCallId: string; toolName: string; isError: boolean; content: string }
  | { type: 'approval_required'; toolCallIds: string[] }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'status'; status: string }
  | { type: 'error'; message: string }
  | { type: 'turn_end'; reason: string };

export interface BufferedEvent {
  seq: number;
  event: AgentEvent;
}

type Listener = (buffered: BufferedEvent) => void;

const RING_SIZE = 200;

interface Channel {
  listeners: Set<Listener>;
  buffer: BufferedEvent[];
  seq: number;
}

const channels = new Map<string, Channel>();

function getChannel(conversationId: string): Channel {
  let channel = channels.get(conversationId);
  if (!channel) {
    channel = { listeners: new Set(), buffer: [], seq: 0 };
    channels.set(conversationId, channel);
  }
  return channel;
}

export function emitAgentEvent(conversationId: string, event: AgentEvent): void {
  const channel = getChannel(conversationId);
  channel.seq += 1;

  const buffered: BufferedEvent = { seq: channel.seq, event };
  channel.buffer.push(buffered);
  if (channel.buffer.length > RING_SIZE) channel.buffer.shift();

  for (const listener of channel.listeners) {
    try {
      listener(buffered);
    } catch {
      // One bad subscriber must not stop the others, or the turn.
    }
  }
}

export function subscribeAgentEvents(
  conversationId: string,
  listener: Listener,
  options: { sinceSeq?: number } = {}
): () => void {
  const channel = getChannel(conversationId);

  if (options.sinceSeq != null) {
    for (const buffered of channel.buffer) {
      if (buffered.seq > options.sinceSeq) listener(buffered);
    }
  }

  channel.listeners.add(listener);

  return () => {
    channel.listeners.delete(listener);
    // Drop the channel once nobody is listening and nothing is buffered.
    if (channel.listeners.size === 0 && channel.buffer.length === 0) {
      channels.delete(conversationId);
    }
  };
}

export function clearAgentEvents(conversationId: string): void {
  channels.delete(conversationId);
}

/**
 * In-flight turns, so a turn can be cancelled from a different request than the
 * one that started it.
 */
const running = new Map<string, AbortController>();

export function registerRunningTurn(conversationId: string): AbortController {
  cancelRunningTurn(conversationId);
  const controller = new AbortController();
  running.set(conversationId, controller);
  return controller;
}

export function cancelRunningTurn(conversationId: string): boolean {
  const controller = running.get(conversationId);
  if (!controller) return false;

  controller.abort();
  running.delete(conversationId);
  return true;
}

export function clearRunningTurn(conversationId: string): void {
  running.delete(conversationId);
}

export function isTurnRunning(conversationId: string): boolean {
  return running.has(conversationId);
}
