import Anthropic from '@anthropic-ai/sdk';
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
 * Anthropic adapter. Always streams: the agent loop produces long tool inputs
 * and large max_tokens, and a non-streaming request of that size runs into HTTP
 * timeouts.
 */

/**
 * Models that reject sampling parameters with a 400. The settings field stays
 * (it is valid for an OpenAI-compatible endpoint) but must be dropped here.
 */
const REJECTS_SAMPLING = [
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-fable-',
  'claude-mythos-',
];

export function rejectsSamplingParams(model: string): boolean {
  return REJECTS_SAMPLING.some((prefix) => model.startsWith(prefix));
}

function toAnthropicContent(blocks: LlmBlock[]): Anthropic.ContentBlockParam[] {
  const out: Anthropic.ContentBlockParam[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        out.push({ type: 'text', text: block.text });
        break;
      case 'thinking':
        // A thinking block is only replayable with its original signature. The
        // normalised path usually lacks one, and the loop replays provider_raw
        // instead whenever provider+model still match, so dropping is correct.
        if (block.signature) {
          out.push({ type: 'thinking', thinking: block.text, signature: block.signature });
        }
        break;
      case 'tool_use':
        out.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
        break;
      case 'tool_result':
        out.push({
          type: 'tool_result',
          tool_use_id: block.toolUseId,
          content: block.content,
          is_error: block.isError ?? false,
        });
        break;
    }
  }

  return out;
}

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      // Mid-conversation operator instruction. Not supported on every model, so
      // it is folded into a user turn rather than risking a 400.
      out.push({ role: 'user', content: toAnthropicContent(message.content) });
      continue;
    }

    // Replay the provider's own blocks when we kept them: thinking blocks must
    // come back unchanged on the next turn of the same model.
    const content =
      Array.isArray(message.raw) && message.raw.length > 0
        ? (message.raw as Anthropic.ContentBlockParam[])
        : toAnthropicContent(message.content);

    if (content.length === 0) continue;
    out.push({ role: message.role, content });
  }

  return out;
}

function fromAnthropicContent(content: Anthropic.ContentBlock[]): LlmBlock[] {
  const blocks: LlmBlock[] = [];

  for (const block of content) {
    switch (block.type) {
      case 'text':
        blocks.push({ type: 'text', text: block.text });
        break;
      case 'thinking':
        blocks.push({ type: 'thinking', text: block.thinking, signature: block.signature });
        break;
      case 'tool_use':
        blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
        break;
      default:
        // Server-tool and other block types are not part of this tool surface.
        break;
    }
  }

  return blocks;
}

function toUsage(usage: Anthropic.Usage): LlmUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? undefined,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? undefined,
  };
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly defaultMaxTokens: number;

  constructor(config: {
    apiKey: string;
    baseUrl?: string | null;
    model: string;
    maxTokens?: number;
  }) {
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens ?? 16000;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
  }

  async chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<LlmTurn> {
    const onEvent = opts.onEvent;

    const tools: Anthropic.ToolUnion[] | undefined = opts.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      // Large inputs (file bodies) stream as they generate instead of arriving
      // in one burst. The caller validates before executing, since the server
      // stops validating tool input when this is on.
      ...(tool.eagerInput ? { eager_input_streaming: true } : {}),
    }));

    const params: Anthropic.MessageStreamParams = {
      model: this.model,
      max_tokens: opts.maxTokens ?? this.defaultMaxTokens,
      messages: toAnthropicMessages(messages),
      // Adaptive thinking; `display` is an explicit opt-in because the default
      // on current models is `omitted`, which streams empty thinking blocks and
      // reads as a long dead pause in a chat UI.
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: opts.effort ?? 'high' },
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(opts.disableParallelToolCalls
        ? { tool_choice: { type: 'auto', disable_parallel_tool_use: true } }
        : {}),
    };

    if (opts.system) {
      // Cache the system prompt; it is the stable head of the request prefix.
      params.system = [
        { type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } },
      ];
    }

    if (opts.temperature != null && !rejectsSamplingParams(this.model)) {
      params.temperature = opts.temperature;
    }

    const stream = this.client.messages.stream(params, { signal: opts.signal });

    if (onEvent) {
      stream.on('streamEvent', (event) => {
        switch (event.type) {
          case 'content_block_start':
            if (event.content_block.type === 'tool_use') {
              onEvent({
                type: 'tool_use_start',
                id: event.content_block.id,
                name: event.content_block.name,
              });
            }
            break;
          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              onEvent({ type: 'text_delta', text: event.delta.text });
            } else if (event.delta.type === 'thinking_delta') {
              onEvent({ type: 'thinking_delta', text: event.delta.thinking });
            } else if (event.delta.type === 'input_json_delta') {
              onEvent({
                type: 'tool_input_delta',
                id: String(event.index),
                partialJson: event.delta.partial_json,
              });
            }
            break;
        }
      });
    }

    const message = await stream.finalMessage();
    const blocks = fromAnthropicContent(message.content);

    if (onEvent) {
      for (const block of blocks) {
        if (block.type === 'tool_use') {
          onEvent({ type: 'tool_use_end', id: block.id, name: block.name, input: block.input });
        }
      }
    }

    const usage = toUsage(message.usage);
    const stopReason = (message.stop_reason ?? 'end_turn') as LlmStopReason;

    onEvent?.({ type: 'message_stop', stopReason, usage });

    return {
      blocks,
      // Kept verbatim for replay; thinking blocks must return unchanged.
      raw: message.content,
      stopReason,
      stopDetails: message.stop_details
        ? {
            category: 'category' in message.stop_details ? message.stop_details.category : null,
            explanation:
              'explanation' in message.stop_details ? message.stop_details.explanation : null,
          }
        : null,
      usage,
      model: message.model,
      provider: this.name,
    };
  }
}
