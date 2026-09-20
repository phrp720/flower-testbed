/**
 * Provider-neutral shapes. The agent orchestrator only ever sees these; every
 * Anthropic-vs-OpenAI difference is absorbed by the adapters in this directory.
 */

export type LlmProviderName = 'anthropic' | 'openai-compatible';

/**
 * Wire-accurate roles. Note there is no 'tool' role: tool results travel as
 * `tool_result` blocks inside a user message (Anthropic's shape). The
 * openai-compatible adapter fans them out into {role:'tool'} messages itself.
 */
export type LlmRole = 'user' | 'assistant' | 'system';

export type LlmBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string; signature?: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: unknown;
      /**
       * Vendor fields that came attached to this call and must be echoed back.
       *
       * Gemini returns a `thought_signature` on every function call and rejects
       * the next request with 400 INVALID_ARGUMENT if the call is replayed
       * without it. Kept opaque and generic rather than typed to one vendor,
       * because the rule -- hand back whatever the provider gave you -- is the
       * same everywhere, and a block built from scratch always loses it.
       */
      providerFields?: Record<string, unknown>;
    }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface LlmMessage {
  role: LlmRole;
  content: LlmBlock[];
  /**
   * The provider's own content array, verbatim. Replayed instead of `content`
   * when the active provider+model still match, because Claude requires thinking
   * blocks to be echoed back unchanged on the next turn of the same model.
   */
  raw?: unknown;
}

export interface LlmToolDef {
  name: string;
  description: string;
  /** JSON Schema. Both providers accept it directly. */
  inputSchema: Record<string, unknown>;
  /**
   * Stream large tool inputs as they generate instead of buffering. Set on tools
   * whose input carries file bodies. The server then stops validating the input,
   * so the caller must validate before executing.
   */
  eagerInput?: boolean;
}

export type LlmEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type LlmStopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_tokens'
  | 'refusal'
  | 'stop_sequence'
  | 'pause_turn'
  | 'error';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_input_delta'; id: string; partialJson: string }
  | { type: 'tool_use_end'; id: string; name: string; input: unknown }
  | { type: 'message_stop'; stopReason: LlmStopReason; usage: LlmUsage }
  | { type: 'error'; message: string };

export interface LlmStopDetails {
  category?: string | null;
  explanation?: string | null;
}

export interface LlmTurn {
  blocks: LlmBlock[];
  raw: unknown;
  stopReason: LlmStopReason;
  stopDetails?: LlmStopDetails | null;
  usage: LlmUsage;
  model: string;
  provider: LlmProviderName;
}

export interface LlmChatOptions {
  system?: string;
  tools?: LlmToolDef[];
  maxTokens?: number;
  /** Dropped by the Anthropic adapter on models that reject sampling params. */
  temperature?: number | null;
  effort?: LlmEffort;
  signal?: AbortSignal;
  disableParallelToolCalls?: boolean;
  onEvent?: (event: LlmStreamEvent) => void;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  readonly model: string;
  chat(messages: LlmMessage[], opts?: LlmChatOptions): Promise<LlmTurn>;
}

export interface EmbeddingProvider {
  readonly model: string;
  /** Native width of the model, before padding/truncation to the stored width. */
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
