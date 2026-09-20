import type {
  LlmBlock,
  LlmChatOptions,
  LlmMessage,
  LlmProvider,
  LlmStopReason,
  LlmTurn,
  LlmUsage,
} from './types';

/**
 * Adapter for any server speaking the OpenAI /chat/completions shape:
 * Ollama, vLLM, LM Studio, OpenRouter, Azure, llama.cpp.
 *
 * Three shape differences from Anthropic live here so the orchestrator never
 * sees them:
 *
 *  1. Streamed tool calls arrive as string fragments keyed by `index`, with
 *     `id` and `name` usually only on the first fragment -- and some servers
 *     omit `id` entirely.
 *  2. Tool results fan out: Anthropic takes N tool_result blocks in one user
 *     message, OpenAI takes N separate {role:'tool'} messages.
 *  3. Reasoning arrives as `delta.reasoning_content` (DeepSeek, vLLM) or inline
 *     <think> tags (Ollama) rather than as thinking blocks.
 */

interface OpenAiToolCallFragment {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiStreamChunk {
  choices?: Array<{
    index?: number;
    delta?: {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: OpenAiToolCallFragment[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null;
}

type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

function blocksToText(blocks: LlmBlock[]): string {
  return blocks
    .filter((b): b is Extract<LlmBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

function toOpenAiMessages(messages: LlmMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      out.push({ role: 'system', content: blocksToText(message.content) });
      continue;
    }

    if (message.role === 'assistant') {
      const toolCalls = message.content
        .filter((b): b is Extract<LlmBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));

      const text = blocksToText(message.content);
      out.push({
        role: 'assistant',
        content: text.length > 0 ? text : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // User turn. Tool results become their own messages and must precede any
    // remaining user text.
    const toolResults = message.content.filter(
      (b): b is Extract<LlmBlock, { type: 'tool_result' }> => b.type === 'tool_result'
    );

    for (const result of toolResults) {
      out.push({ role: 'tool', tool_call_id: result.toolUseId, content: result.content });
    }

    const text = blocksToText(message.content);
    if (text.length > 0) out.push({ role: 'user', content: text });
  }

  return out;
}

function mapFinishReason(reason: string | null | undefined): LlmStopReason {
  switch (reason) {
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    case 'stop':
      return 'end_turn';
    default:
      return 'end_turn';
  }
}

/** Strips inline <think>…</think>, which Ollama emits in the content stream. */
function splitInlineThinking(text: string): { thinking: string; content: string } {
  const matches = [...text.matchAll(/<think>([\s\S]*?)<\/think>/g)];
  if (matches.length === 0) return { thinking: '', content: text };

  return {
    thinking: matches.map((m) => m[1]).join('\n'),
    content: text.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
  };
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly defaultMaxTokens: number;

  constructor(config: {
    baseUrl: string;
    apiKey?: string | null;
    model: string;
    maxTokens?: number;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey ?? null;
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens ?? 16000;
  }

  async chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<LlmTurn> {
    const onEvent = opts.onEvent;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: toOpenAiMessages(
        opts.system
          ? [{ role: 'system', content: [{ type: 'text', text: opts.system }] }, ...messages]
          : messages
      ),
      max_tokens: opts.maxTokens ?? this.defaultMaxTokens,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (opts.temperature != null) body.temperature = opts.temperature;

    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
      if (opts.disableParallelToolCalls) body.parallel_tool_calls = false;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Chat request failed (${response.status} ${response.statusText})${
          detail ? `: ${detail.slice(0, 500)}` : ''
        }`
      );
    }

    let text = '';
    let thinking = '';
    let stopReason: LlmStopReason = 'end_turn';
    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

    // Accumulated per `index`, because a call's name and id may only ever
    // appear on its first fragment.
    const toolBuffers = new Map<number, { id: string; name: string; args: string }>();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data:')) continue;

          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;

          let chunk: OpenAiStreamChunk;
          try {
            chunk = JSON.parse(payload);
          } catch {
            // A malformed frame should not abort a turn that is otherwise fine.
            continue;
          }

          if (chunk.usage) {
            usage.inputTokens = chunk.usage.prompt_tokens ?? usage.inputTokens;
            usage.outputTokens = chunk.usage.completion_tokens ?? usage.outputTokens;
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          const reasoning = choice.delta?.reasoning_content ?? choice.delta?.reasoning;
          if (reasoning) {
            thinking += reasoning;
            onEvent?.({ type: 'thinking_delta', text: reasoning });
          }

          if (choice.delta?.content) {
            text += choice.delta.content;
            onEvent?.({ type: 'text_delta', text: choice.delta.content });
          }

          for (const fragment of choice.delta?.tool_calls ?? []) {
            const index = fragment.index ?? 0;
            let entry = toolBuffers.get(index);

            if (!entry) {
              entry = {
                // Some servers never send an id; synthesise a stable one so the
                // tool_result can still be matched back.
                id: fragment.id ?? `call_${index}`,
                name: fragment.function?.name ?? '',
                args: '',
              };
              toolBuffers.set(index, entry);
              if (entry.name) onEvent?.({ type: 'tool_use_start', id: entry.id, name: entry.name });
            }

            if (fragment.id) entry.id = fragment.id;
            if (fragment.function?.name) entry.name = fragment.function.name;
            if (fragment.function?.arguments) {
              entry.args += fragment.function.arguments;
              onEvent?.({
                type: 'tool_input_delta',
                id: entry.id,
                partialJson: fragment.function.arguments,
              });
            }
          }

          if (choice.finish_reason) stopReason = mapFinishReason(choice.finish_reason);
        }
      }
    } finally {
      reader.releaseLock();
    }

    const blocks: LlmBlock[] = [];

    const inline = splitInlineThinking(text);
    const allThinking = [thinking, inline.thinking].filter(Boolean).join('\n');
    if (allThinking) blocks.push({ type: 'thinking', text: allThinking });
    if (inline.content) blocks.push({ type: 'text', text: inline.content });

    for (const entry of [...toolBuffers.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])) {
      if (!entry.name) continue;

      // Parsed only now that the whole argument string has arrived. A local
      // model producing invalid JSON is common, so surface it to the model as a
      // tool error rather than throwing the turn away.
      let input: unknown = {};
      try {
        input = entry.args.trim() ? JSON.parse(entry.args) : {};
      } catch {
        input = { __parseError: `Model produced invalid JSON arguments: ${entry.args.slice(0, 200)}` };
      }

      blocks.push({ type: 'tool_use', id: entry.id, name: entry.name, input });
      onEvent?.({ type: 'tool_use_end', id: entry.id, name: entry.name, input });
    }

    if (toolBuffers.size > 0 && stopReason === 'end_turn') stopReason = 'tool_use';

    onEvent?.({ type: 'message_stop', stopReason, usage });

    return {
      blocks,
      raw: null,
      stopReason,
      stopDetails: null,
      usage,
      model: this.model,
      provider: this.name,
    };
  }
}
