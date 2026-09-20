import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  real,
  jsonb,
  boolean,
  vector,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { experiments } from './schema';
import type { LlmBlock, LlmStopDetails } from '@/lib/llm/types';

/**
 * Agent layer tables. Re-exported from ./schema so drizzle-kit and lib/db/index
 * pick them up without further wiring.
 *
 * Foreign keys into `experiments` are declared through thunks, which is what
 * makes the circular import between this file and ./schema safe: the reference
 * is only resolved when drizzle builds DDL or a query, long after both modules
 * have finished evaluating.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Single-row LLM connection config. `settingsKey` is unique so writes can be a
 * plain onConflictDoUpdate upsert rather than a read-then-branch.
 *
 * API keys are stored as AES-256-GCM blobs (lib/crypto/secrets.ts) and are never
 * returned over HTTP -- the UI only ever sees `apiKeyHint`.
 */
export const agentSettings = pgTable(
  'agent_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    settingsKey: text('settings_key').notNull().default('default'),

    // Chat model
    provider: text('provider').notNull().default('anthropic'), // 'anthropic' | 'openai-compatible'
    baseUrl: text('base_url'), // null => provider default
    apiKeyCiphertext: text('api_key_ciphertext'),
    apiKeyHint: text('api_key_hint'), // last 4 chars, display only
    model: text('model').notNull().default('claude-opus-5'),
    maxTokens: integer('max_tokens').notNull().default(16000),
    effort: text('effort').notNull().default('high'), // low|medium|high|xhigh|max
    temperature: real('temperature'), // dropped by the adapter on models that reject it
    disableParallelToolCalls: boolean('disable_parallel_tool_calls').notNull().default(false),
    systemPromptOverride: text('system_prompt_override'),

    // Embeddings. Independent because Anthropic has no embeddings endpoint.
    embeddingProvider: text('embedding_provider').notNull().default('none'), // 'none' | 'openai-compatible'
    embeddingBaseUrl: text('embedding_base_url'),
    embeddingApiKeyCiphertext: text('embedding_api_key_ciphertext'),
    embeddingApiKeyHint: text('embedding_api_key_hint'),
    embeddingModel: text('embedding_model'),
    embeddingDimensions: integer('embedding_dimensions').notNull().default(1536),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('agent_settings_key_idx').on(t.settingsKey)]
);

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const agentConversations = pgTable(
  'agent_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull().default('New conversation'),

    /** Lifts the approval gate for this conversation only. Defaults off. */
    autoRun: boolean('auto_run').notNull().default(false),
    status: text('status').notNull().default('idle'), // idle|running|awaiting_approval|error

    /** Optional pinned experiment context. */
    experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'set null' }),

    // Snapshot of what produced this thread; drives provider_raw replay.
    provider: text('provider'),
    model: text('model'),

    summary: text('summary'),
    errorMessage: text('error_message'),

    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at'),
  },
  (t) => [index('agent_conversations_updated_idx').on(t.updatedAt)]
);

export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agentConversations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),

    /** Wire role. Tool results are user messages carrying tool_result blocks. */
    role: text('role').notNull(), // 'user' | 'assistant' | 'system'
    /** What the UI keys off, so tool results are not rendered as the user speaking. */
    kind: text('kind').notNull().default('chat'), // 'chat' | 'tool_results' | 'system_note'

    content: jsonb('content').$type<LlmBlock[]>().notNull(),
    /** Provider's own content array, verbatim -- required to replay thinking blocks. */
    providerRaw: jsonb('provider_raw'),
    providerName: text('provider_name'),
    model: text('model'),

    stopReason: text('stop_reason'),
    stopDetails: jsonb('stop_details').$type<LlmStopDetails>(),

    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheCreationTokens: integer('cache_creation_tokens'),

    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('agent_messages_conversation_seq_idx').on(t.conversationId, t.seq)]
);

// ---------------------------------------------------------------------------
// Tool calls -- this table *is* the approval queue
// ---------------------------------------------------------------------------

/**
 * A pending action is simply `status='pending' AND requires_approval=true`.
 * The row holds everything needed to resume a suspended turn after a restart,
 * which is why the loop never keeps continuation state in memory.
 */
export const agentToolCalls = pgTable(
  'agent_tool_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agentConversations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => agentMessages.id, { onDelete: 'cascade' }),

    /** Provider-assigned id. Must be echoed back on the matching tool_result. */
    toolUseId: text('tool_use_id').notNull(),
    toolName: text('tool_name').notNull(),
    input: jsonb('input').notNull(),

    riskLevel: text('risk_level').notNull().default('read'), // read|write|execute
    requiresApproval: boolean('requires_approval').notNull().default(false),
    status: text('status').notNull().default('pending'), // pending|approved|rejected|running|succeeded|failed

    /** Plain-language sentence for the approval card. */
    previewSummary: text('preview_summary'),
    /** Unified diff, computed server-side so the client needs no diff library. */
    previewDiff: text('preview_diff'),

    resultContent: jsonb('result_content'),
    isError: boolean('is_error').notNull().default(false),
    decisionNote: text('decision_note'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    approvedAt: timestamp('approved_at'),
    rejectedAt: timestamp('rejected_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    index('agent_tool_calls_conversation_idx').on(t.conversationId, t.status),
    index('agent_tool_calls_message_idx').on(t.messageId),
  ]
);

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/** Files the agent wrote, versioned: each rewrite supersedes the previous row. */
export const agentArtifacts = pgTable(
  'agent_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => agentConversations.id, {
      onDelete: 'set null',
    }),
    toolCallId: uuid('tool_call_id').references(() => agentToolCalls.id, { onDelete: 'set null' }),
    experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'set null' }),

    kind: text('kind').notNull(), // algorithm|model|dataset|config|note|report|patch|attachment
    filename: text('filename').notNull(),
    /** Relative to the agent workspace root. */
    relativePath: text('relative_path').notNull(),
    language: text('language').default('python'),

    contentHash: text('content_hash'),
    sizeBytes: integer('size_bytes'),
    version: integer('version').notNull().default(1),
    // Self-reference needs an explicit return type to break the inference cycle.
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => agentArtifacts.id, {
      onDelete: 'set null',
    }),

    appliedAt: timestamp('applied_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('agent_artifacts_conversation_idx').on(t.conversationId)]
);

// ---------------------------------------------------------------------------
// API tokens for external MCP hosts
// ---------------------------------------------------------------------------

/** NextAuth cookies cannot reach Claude Desktop, so bearer tokens are the external path. */
export const agentApiTokens = pgTable(
  'agent_api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(), // sha256; the token itself is shown once
    prefix: text('prefix').notNull(),
    scopes: text('scopes').notNull().default('read'), // 'read' | 'write'

    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('agent_api_tokens_hash_idx').on(t.tokenHash)]
);

// ---------------------------------------------------------------------------
// Evaluation runs (populated in the follow-up phase)
// ---------------------------------------------------------------------------

/** Kept separate from `metrics` so that table stays a pure per-round training series. */
export const evaluationRuns = pgTable(
  'evaluation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    /**
     * null = the aggregated global model; set = that client's local model.
     * Text, not integer: Flower assigns client ids as 18-digit values that
     * overflow int4.
     */
    clientId: text('client_id'),

    datasetPath: text('dataset_path'),
    split: text('split').default('test'),

    loss: real('loss'),
    accuracy: real('accuracy'),
    extraMetrics: jsonb('extra_metrics'),

    status: text('status').notNull().default('pending'), // pending|running|completed|failed
    errorMessage: text('error_message'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (t) => [index('evaluation_runs_experiment_idx').on(t.experimentId, t.round)]
);

// ---------------------------------------------------------------------------
// Memory (pgvector)
// ---------------------------------------------------------------------------

/**
 * Stored width is fixed at 1536: it is the most common native width, it sits
 * under pgvector's 2000-dimension HNSW ceiling, and it is wider than every
 * common local model. Narrower models are zero-padded, which is exact for
 * cosine similarity since padding changes neither dot products nor norms.
 *
 * `embeddingModel` and `dimensions` record what actually produced the vector so
 * kNN queries can filter to the active model -- switching models degrades to an
 * empty recall rather than to meaningless neighbours, with no ALTER TABLE.
 */
export const agentEmbeddings = pgTable(
  'agent_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceType: text('source_type').notNull(), // experiment|metrics|logs|artifact|upload|conversation_summary|insight
    sourceId: uuid('source_id'),
    sourceRef: text('source_ref'),
    chunkIndex: integer('chunk_index').notNull().default(0),

    content: text('content').notNull(),
    metadata: jsonb('metadata'),

    embeddingModel: text('embedding_model').notNull(),
    /** Native width of the producing model, before padding to the stored width. */
    dimensions: integer('dimensions').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('agent_embeddings_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('agent_embeddings_source_idx').on(t.sourceType, t.sourceId),
  ]
);

export const EMBEDDING_STORAGE_DIMENSIONS = 1536;
