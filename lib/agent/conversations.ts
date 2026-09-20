import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { loadAgentSettings } from '@/lib/llm/settings';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { LlmBlock, LlmMessage, LlmStopDetails, LlmUsage } from '@/lib/llm/types';

/**
 * Conversation and message persistence.
 *
 * Postgres is the source of truth for a turn, not the process running it. That
 * is what lets a suspended turn resume after a restart, and what makes losing
 * the SSE stream harmless.
 */

export type Conversation = typeof schema.agentConversations.$inferSelect;
export type AgentMessage = typeof schema.agentMessages.$inferSelect;
export type AgentToolCall = typeof schema.agentToolCalls.$inferSelect;

export type ConversationStatus = 'idle' | 'running' | 'awaiting_approval' | 'error';
export type MessageKind = 'chat' | 'tool_results' | 'system_note';

export async function listConversations(limit = 50): Promise<Conversation[]> {
  return db
    .select()
    .from(schema.agentConversations)
    .orderBy(desc(schema.agentConversations.updatedAt))
    .limit(limit);
}

export async function getConversation(id: string): Promise<Conversation> {
  const [conversation] = await db
    .select()
    .from(schema.agentConversations)
    .where(eq(schema.agentConversations.id, id));

  if (!conversation) throw new NotFoundError('Conversation not found');
  return conversation;
}

export async function createConversation(input: {
  title?: string;
  experimentId?: string | null;
  autoRun?: boolean;
} = {}): Promise<Conversation> {
  // Seeded from the saved preference when the caller does not say. Copied onto
  // the row rather than read through at approval time, so changing the default
  // later never silently alters how an existing conversation behaves.
  const settings = await loadAgentSettings();

  const [conversation] = await db
    .insert(schema.agentConversations)
    .values({
      title: input.title?.trim() || 'New conversation',
      experimentId: input.experimentId ?? null,
      autoRun: input.autoRun ?? settings.defaultAutoRun,
    })
    .returning();

  return conversation;
}

export async function updateConversation(
  id: string,
  patch: { title?: string; autoRun?: boolean; experimentId?: string | null }
): Promise<Conversation> {
  await getConversation(id);

  const updates: Partial<typeof schema.agentConversations.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new ValidationError('Title cannot be empty.');
    updates.title = title;
  }
  if (patch.autoRun !== undefined) updates.autoRun = patch.autoRun;
  if (patch.experimentId !== undefined) updates.experimentId = patch.experimentId;

  const [conversation] = await db
    .update(schema.agentConversations)
    .set(updates)
    .where(eq(schema.agentConversations.id, id))
    .returning();

  return conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  await getConversation(id);
  await db.delete(schema.agentConversations).where(eq(schema.agentConversations.id, id));
}

export async function setConversationStatus(
  id: string,
  status: ConversationStatus,
  errorMessage: string | null = null
): Promise<void> {
  await db
    .update(schema.agentConversations)
    .set({ status, errorMessage, updatedAt: new Date() })
    .where(eq(schema.agentConversations.id, id));
}

export async function addConversationUsage(id: string, usage: LlmUsage): Promise<void> {
  await db
    .update(schema.agentConversations)
    .set({
      inputTokens: sql`${schema.agentConversations.inputTokens} + ${usage.inputTokens}`,
      outputTokens: sql`${schema.agentConversations.outputTokens} + ${usage.outputTokens}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.agentConversations.id, id));
}

export async function getMessages(conversationId: string): Promise<AgentMessage[]> {
  return db
    .select()
    .from(schema.agentMessages)
    .where(eq(schema.agentMessages.conversationId, conversationId))
    .orderBy(asc(schema.agentMessages.seq));
}

async function nextSeq(conversationId: string): Promise<number> {
  const [row] = await db
    .select({ maxSeq: sql<number | null>`max(${schema.agentMessages.seq})` })
    .from(schema.agentMessages)
    .where(eq(schema.agentMessages.conversationId, conversationId));

  return (row?.maxSeq ?? 0) + 1;
}

export interface AppendMessageInput {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  kind?: MessageKind;
  content: LlmBlock[];
  providerRaw?: unknown;
  providerName?: string | null;
  model?: string | null;
  stopReason?: string | null;
  stopDetails?: LlmStopDetails | null;
  usage?: LlmUsage | null;
  errorMessage?: string | null;
}

export async function appendMessage(input: AppendMessageInput): Promise<AgentMessage> {
  const [message] = await db
    .insert(schema.agentMessages)
    .values({
      conversationId: input.conversationId,
      seq: await nextSeq(input.conversationId),
      role: input.role,
      kind: input.kind ?? 'chat',
      content: input.content,
      providerRaw: input.providerRaw ?? null,
      providerName: input.providerName ?? null,
      model: input.model ?? null,
      stopReason: input.stopReason ?? null,
      stopDetails: input.stopDetails ?? null,
      inputTokens: input.usage?.inputTokens ?? null,
      outputTokens: input.usage?.outputTokens ?? null,
      cacheReadTokens: input.usage?.cacheReadTokens ?? null,
      cacheCreationTokens: input.usage?.cacheCreationTokens ?? null,
      errorMessage: input.errorMessage ?? null,
    })
    .returning();

  await db
    .update(schema.agentConversations)
    .set({ updatedAt: new Date(), lastMessageAt: new Date() })
    .where(eq(schema.agentConversations.id, input.conversationId));

  return message;
}

/**
 * Rebuild the provider-facing history.
 *
 * `providerRaw` is replayed whenever the active provider and model still match
 * the ones that produced it. That is not an optimisation: Claude requires
 * thinking blocks to come back byte-identical on the next turn of the same
 * model, and only the raw blocks carry their signatures. After a model switch
 * the raw blocks are meaningless, so the normalised content is used instead and
 * thinking is dropped -- which the Anthropic adapter handles by skipping
 * unsigned thinking blocks.
 */
export function toLlmMessages(
  messages: AgentMessage[],
  active: { provider: string; model: string }
): LlmMessage[] {
  return messages
    .filter((message) => message.kind !== 'system_note')
    .map((message) => {
      const sameModel =
        message.providerName === active.provider && message.model === active.model;

      return {
        role: message.role as LlmMessage['role'],
        content: (message.content ?? []) as LlmBlock[],
        ...(sameModel && message.providerRaw ? { raw: message.providerRaw } : {}),
      };
    })
    .filter((message) => message.content.length > 0 || message.raw != null);
}

// ---------------------------------------------------------------------------
// Tool calls -- the approval queue
// ---------------------------------------------------------------------------

export interface RecordToolCallInput {
  conversationId: string;
  messageId: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  riskLevel: string;
  requiresApproval: boolean;
  previewSummary?: string | null;
  previewDiff?: string | null;
}

export async function recordToolCall(input: RecordToolCallInput): Promise<AgentToolCall> {
  const [row] = await db
    .insert(schema.agentToolCalls)
    .values({
      conversationId: input.conversationId,
      messageId: input.messageId,
      toolUseId: input.toolUseId,
      toolName: input.toolName,
      input: input.input,
      riskLevel: input.riskLevel,
      requiresApproval: input.requiresApproval,
      status: input.requiresApproval ? 'pending' : 'approved',
      previewSummary: input.previewSummary ?? null,
      previewDiff: input.previewDiff ?? null,
    })
    .returning();

  return row;
}

export async function getToolCall(id: string): Promise<AgentToolCall> {
  const [row] = await db
    .select()
    .from(schema.agentToolCalls)
    .where(eq(schema.agentToolCalls.id, id));

  if (!row) throw new NotFoundError('Tool call not found');
  return row;
}

export async function getPendingToolCalls(conversationId: string): Promise<AgentToolCall[]> {
  return db
    .select()
    .from(schema.agentToolCalls)
    .where(
      and(
        eq(schema.agentToolCalls.conversationId, conversationId),
        eq(schema.agentToolCalls.status, 'pending')
      )
    )
    .orderBy(asc(schema.agentToolCalls.createdAt));
}

/**
 * Has this exact call already been declined since the user last spoke?
 *
 * Matched on the tool and the whole input, so changing a parameter counts as a
 * new proposal and is offered normally.
 *
 * Scoped to the current turn, not the whole conversation. A decline means "not
 * now", and asking again later is the user's decision to make: a conversation-
 * wide block turned "do it again" into an argument, with the agent refusing
 * something the user had just explicitly requested. What must not happen is the
 * model re-proposing on its own with nothing said in between.
 */
export async function wasRejectedThisTurn(
  conversationId: string,
  toolName: string,
  input: unknown,
  since: Date
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.agentToolCalls.id })
    .from(schema.agentToolCalls)
    .where(
      and(
        eq(schema.agentToolCalls.conversationId, conversationId),
        eq(schema.agentToolCalls.toolName, toolName),
        eq(schema.agentToolCalls.status, 'rejected'),
        gt(schema.agentToolCalls.createdAt, since),
        sql`${schema.agentToolCalls.input}::jsonb = ${JSON.stringify(input ?? {})}::jsonb`
      )
    )
    .limit(1);

  return row != null;
}

export async function getToolCallsForMessage(messageId: string): Promise<AgentToolCall[]> {
  return db
    .select()
    .from(schema.agentToolCalls)
    .where(eq(schema.agentToolCalls.messageId, messageId))
    .orderBy(asc(schema.agentToolCalls.createdAt));
}

/**
 * Conditional update, so a double-click is a no-op rather than a second
 * execution. Returns null when the row was already decided.
 */
export async function decideToolCall(
  id: string,
  decision: 'approved' | 'rejected',
  note?: string | null
): Promise<AgentToolCall | null> {
  const [row] = await db
    .update(schema.agentToolCalls)
    .set({
      status: decision,
      decisionNote: note ?? null,
      ...(decision === 'approved' ? { approvedAt: new Date() } : { rejectedAt: new Date() }),
    })
    .where(and(eq(schema.agentToolCalls.id, id), eq(schema.agentToolCalls.status, 'pending')))
    .returning();

  return row ?? null;
}

export async function markToolCallRunning(id: string): Promise<void> {
  await db
    .update(schema.agentToolCalls)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(schema.agentToolCalls.id, id));
}

export async function completeToolCall(
  id: string,
  result: { content: string; isError: boolean; durationMs: number }
): Promise<void> {
  await db
    .update(schema.agentToolCalls)
    .set({
      status: result.isError ? 'failed' : 'succeeded',
      resultContent: { text: result.content },
      isError: result.isError,
      completedAt: new Date(),
      durationMs: result.durationMs,
    })
    .where(eq(schema.agentToolCalls.id, id));
}

/**
 * Recover rows abandoned by a process that died mid-call, so a conversation
 * loaded afterwards is not stuck showing a spinner forever.
 */
export async function sweepStaleToolCalls(
  conversationId: string,
  olderThanMs = 2 * 60 * 1000
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs);

  await db
    .update(schema.agentToolCalls)
    .set({
      status: 'failed',
      isError: true,
      resultContent: { text: 'Error: the server restarted while this tool was running.' },
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.agentToolCalls.conversationId, conversationId),
        eq(schema.agentToolCalls.status, 'running'),
        sql`${schema.agentToolCalls.startedAt} < ${cutoff}`
      )
    );
}
