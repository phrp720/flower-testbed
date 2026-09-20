/**
 * SSE frame parser for the POST-based turn stream.
 *
 * EventSource cannot be used for sending a message: it only issues GET requests
 * and cannot carry a body. So the turn streams over the POST response, read with
 * fetch + a stream reader, and parsed here.
 */

export type AgentEvent =
    | { type: "turn_start"; conversationId: string; role: string }
    | { type: "text_delta"; text: string }
    | { type: "thinking_delta"; text: string }
    | { type: "message"; messageId: string; role: string; kind: string; content: unknown }
    | { type: "tool_call"; toolCallId: string; toolName: string; input: unknown; risk: string }
    | { type: "tool_result"; toolCallId: string; toolName: string; isError: boolean; content: string }
    | { type: "approval_required"; toolCallIds: string[] }
    | { type: "usage"; inputTokens: number; outputTokens: number }
    | { type: "status"; status: string }
    | { type: "error"; message: string }
    | { type: "turn_end"; reason: string };

/** Yields each event as it arrives. Comment frames and keep-alives are skipped. */
export async function* readAgentStream(
    body: ReadableStream<Uint8Array>,
): AsyncGenerator<AgentEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Frames are separated by a blank line.
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";

            for (const frame of frames) {
                for (const line of frame.split("\n")) {
                    if (!line.startsWith("data:")) continue;
                    try {
                        yield JSON.parse(line.slice(5).trim()) as AgentEvent;
                    } catch {
                        // A malformed frame should not end an otherwise fine turn.
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
