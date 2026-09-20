import { ValidationError } from '@/lib/errors';
import { createProvider, loadAgentSettings } from '@/lib/llm';
import type { LlmBlock } from '@/lib/llm/types';
import { getTool } from '@/lib/mcp/tools';
import { requiresApproval } from '@/lib/mcp/registry';
import { truncate } from '@/lib/mcp/untrusted';
import { callAgentTool, listAgentTools } from './mcp-client';
import {
  addConversationUsage,
  appendMessage,
  completeToolCall,
  getConversation,
  getMessages,
  getToolCallsForMessage,
  wasRejectedThisTurn,
  markToolCallRunning,
  recordToolCall,
  setConversationStatus,
  sweepStaleToolCalls,
  toLlmMessages,
  type AgentToolCall,
} from './conversations';
import {
  cancelRunningTurn,
  clearRunningTurn,
  emitAgentEvent,
  isTurnRunning,
  registerRunningTurn,
} from './events';
import { buildPreviewSummary } from './preview';
import { buildSystemPrompt, CONVERSATION_TITLE_PROMPT } from './prompts';
import { recall } from './memory';
import { getRole, type RoleName } from './roles';

const MAX_ITERATIONS = Number.parseInt(process.env.AGENT_MAX_ITERATIONS ?? '24', 10) || 24;
/** How long a `running` row with no live turn behind it is left alone. */
const STALE_TURN_MS = 2 * 60 * 1000;
const MAX_TOOL_RESULT_BYTES =
  Number.parseInt(process.env.AGENT_MAX_TOOL_RESULT_BYTES ?? '32768', 10) || 32768;

/**
 * The agent loop.
 *
 * It runs detached from the request that started it, so closing a tab cannot
 * abort a turn mid-tool-call, and every piece of state it needs to resume lives
 * in Postgres rather than in this process.
 */

export interface StartTurnOptions {
  role?: RoleName;
  text: string;
}

function toolUseBlocks(blocks: LlmBlock[]) {
  return blocks.filter(
    (block): block is Extract<LlmBlock, { type: 'tool_use' }> => block.type === 'tool_use'
  );
}

/**
 * Index, within the provider payload, of the last message the user actually
 * typed. toLlmMessages drops system notes, so the two lists can differ in
 * length; walking the filtered history keeps them aligned.
 */
function lastUserChatIndex(
  history: Awaited<ReturnType<typeof getMessages>>,
  payloadLength: number
): number {
  const kept = history.filter((m) => m.kind !== 'system_note');
  for (let i = Math.min(kept.length, payloadLength) - 1; i >= 0; i -= 1) {
    if (kept[i].role === 'user' && kept[i].kind === 'chat') return i;
  }
  return -1;
}

/** Every tool_use needs a matching tool_result, including declined ones. */
function declinedResult(toolUseId: string, note?: string | null): LlmBlock {
  return {
    type: 'tool_result',
    toolUseId,
    content: note
      ? `The user declined this action. They said: ${note}`
      : 'The user declined this action.',
    isError: false,
  };
}

async function executeToolCall(
  conversationId: string,
  row: AgentToolCall
): Promise<LlmBlock> {
  await markToolCallRunning(row.id);
  const startedAt = Date.now();

  const outcome = await callAgentTool(row.toolName, (row.input ?? {}) as Record<string, unknown>);

  // Cap what a single result can add to the context. Logs and file reads are
  // already capped at their own tools, but a tool can always surprise you.
  const capped = truncate(outcome.content, { maxBytes: MAX_TOOL_RESULT_BYTES, fromEnd: false });
  const content = capped.truncated
    ? `${capped.text}\n\n[truncated: ${capped.originalBytes} bytes total]`
    : capped.text;

  await completeToolCall(row.id, {
    content,
    isError: outcome.isError,
    durationMs: Date.now() - startedAt,
  });

  emitAgentEvent(conversationId, {
    type: 'tool_result',
    toolCallId: row.id,
    toolName: row.toolName,
    isError: outcome.isError,
    content,
  });

  return { type: 'tool_result', toolUseId: row.toolUseId, content, isError: outcome.isError };
}

/**
 * One pass of the loop. Returns the reason it stopped so the caller can report
 * it; `awaiting_approval` means the turn is suspended, not finished.
 */
async function runLoop(
  conversationId: string,
  roleName: RoleName,
  signal: AbortSignal,
  retrievedContext: string | null = null
): Promise<string> {
  const settings = await loadAgentSettings();
  const provider = createProvider(settings);
  const role = getRole(roleName);

  const conversation = await getConversation(conversationId);
  const tools = await listAgentTools('write');

  // Built once, from the value the turn started with, and never rebuilt.
  // The system prompt is the byte-exact prefix prompt caching matches on, so
  // changing it mid-turn would throw the cache away for every later iteration.
  const system = buildSystemPrompt({
    role: roleName,
    override: settings.systemPromptOverride,
    autoRun: conversation.autoRun,
  });

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    if (signal.aborted) return 'cancelled';

    const history = await getMessages(conversationId);

    /**
     * When the user last spoke.
     *
     * Tool results carry role 'user' on the wire but kind 'tool_results', and a
     * human did not write them -- so only a 'chat' message moves this forward.
     * It is the boundary a decline is remembered within: the model may not
     * re-propose a refused call on its own, but the moment the user says
     * anything, they are back in charge of what gets proposed.
     */
    const turnStartedAt =
      [...history].reverse().find((m) => m.role === 'user' && m.kind === 'chat')?.createdAt ??
      new Date(0);

    const messages = toLlmMessages(history, {
      provider: settings.provider,
      model: settings.model,
    });

    // Retrieved memory is attached to the provider payload rather than stored on
    // the message. Persisting it would put the retrieval blob inside the user's
    // own message, where the transcript would render it as something they typed.
    if (retrievedContext) {
      const target = lastUserChatIndex(history, messages.length);
      if (target >= 0) {
        messages[target] = {
          ...messages[target],
          content: [...messages[target].content, { type: 'text', text: retrievedContext }],
          // The raw blocks no longer match what is being sent, so they cannot
          // be replayed for this message.
          raw: undefined,
        };
      }
    }

    const turn = await provider.chat(messages, {
      system,
      tools,
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
      effort: role.effort,
      disableParallelToolCalls: settings.disableParallelToolCalls,
      signal,
      onEvent: (event) => {
        if (event.type === 'text_delta') {
          emitAgentEvent(conversationId, { type: 'text_delta', text: event.text });
        } else if (event.type === 'thinking_delta') {
          emitAgentEvent(conversationId, { type: 'thinking_delta', text: event.text });
        }
      },
    });

    const assistant = await appendMessage({
      conversationId,
      role: 'assistant',
      kind: 'chat',
      content: turn.blocks,
      providerRaw: turn.raw,
      providerName: turn.provider,
      model: turn.model,
      stopReason: turn.stopReason,
      stopDetails: turn.stopDetails,
      usage: turn.usage,
    });

    await addConversationUsage(conversationId, turn.usage);

    emitAgentEvent(conversationId, {
      type: 'message',
      messageId: assistant.id,
      role: 'assistant',
      kind: 'chat',
      content: turn.blocks,
    });
    emitAgentEvent(conversationId, {
      type: 'usage',
      inputTokens: turn.usage.inputTokens,
      outputTokens: turn.usage.outputTokens,
    });

    if (turn.stopReason === 'refusal') {
      return `refused${turn.stopDetails?.category ? `:${turn.stopDetails.category}` : ''}`;
    }

    const calls = toolUseBlocks(turn.blocks);
    if (calls.length === 0) return 'end_turn';

    // Re-read rather than reusing the row loaded before the loop: approving a
    // call with "Approve all" flips autoRun mid-turn, and a stale copy would
    // keep prompting for every remaining call in the same turn.
    const { autoRun } = await getConversation(conversationId);

    // Record every call first, so the approval queue is complete before any of
    // them runs. Otherwise a partially-executed batch is possible.
    const rows: AgentToolCall[] = [];
    const refused: Array<{ row: AgentToolCall; toolUseId: string }> = [];

    for (const call of calls) {
      const descriptor = getTool(call.name);
      const risk = descriptor?.risk ?? 'execute';

      /**
       * The same call, declined and re-proposed with nothing said in between.
       *
       * The prompt tells the model not to retry a refusal and a small model
       * ignores it: three identical create_experiment proposals in a row, each
       * re-opening the card. Refused here rather than queued, or declining is a
       * button that ends nothing.
       *
       * Only within the current turn. Blocking for the whole conversation made
       * the agent refuse "do it again" -- arguing with the user about a request
       * they had just made. A decline is "not now", and the next thing the user
       * says outranks it.
       */
      const declinedBefore = await wasRejectedThisTurn(
        conversationId,
        call.name,
        call.input,
        turnStartedAt
      );

      const needsApproval = descriptor
        ? requiresApproval(descriptor) && !autoRun && !declinedBefore
        : true;

      const row = await recordToolCall({
        conversationId,
        messageId: assistant.id,
        toolUseId: call.id,
        toolName: call.name,
        input: call.input,
        riskLevel: risk,
        requiresApproval: needsApproval,
        previewSummary: descriptor ? buildPreviewSummary(descriptor, call.input) : null,
      });

      if (declinedBefore) refused.push({ row, toolUseId: call.id });

      rows.push(row);

      emitAgentEvent(conversationId, {
        type: 'tool_call',
        toolCallId: row.id,
        toolName: row.toolName,
        input: row.input,
        risk,
      });
    }

    const pending = rows.filter((row) => row.status === 'pending');
    if (pending.length > 0) {
      await setConversationStatus(conversationId, 'awaiting_approval');
      emitAgentEvent(conversationId, {
        type: 'approval_required',
        toolCallIds: pending.map((row) => row.id),
      });
      return 'awaiting_approval';
    }

    const refusedIds = new Set(refused.map((entry) => entry.row.id));

    const results: LlmBlock[] = [];
    for (const row of rows) {
      if (signal.aborted) return 'cancelled';

      if (refusedIds.has(row.id)) {
        // Marked as an error so the model treats it as a wall rather than a
        // retryable failure, and told explicitly what to do instead.
        const content =
          'The user declined this exact call a moment ago and has not asked for ' +
          'it again. Do not repeat it. Stop and ask what they would like ' +
          'instead, or propose something different.';

        await completeToolCall(row.id, { content, isError: true, durationMs: 0 });
        results.push({ type: 'tool_result', toolUseId: row.toolUseId, content, isError: true });
        continue;
      }

      results.push(await executeToolCall(conversationId, row));
    }

    const toolMessage = await appendMessage({
      conversationId,
      role: 'user',
      kind: 'tool_results',
      content: results,
      providerName: settings.provider,
      model: settings.model,
    });

    emitAgentEvent(conversationId, {
      type: 'message',
      messageId: toolMessage.id,
      role: 'user',
      kind: 'tool_results',
      content: results,
    });
  }

  return 'max_iterations';
}

async function drive(
  conversationId: string,
  roleName: RoleName,
  retrievedContext: string | null = null
): Promise<void> {
  const controller = registerRunningTurn(conversationId);

  try {
    await setConversationStatus(conversationId, 'running');
    emitAgentEvent(conversationId, { type: 'turn_start', conversationId, role: roleName });

    const reason = await runLoop(conversationId, roleName, controller.signal, retrievedContext);

    if (reason !== 'awaiting_approval') {
      await setConversationStatus(conversationId, 'idle');
    }

    emitAgentEvent(conversationId, { type: 'turn_end', reason });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'The agent failed for an unknown reason.';

    console.error(`Agent turn failed for conversation ${conversationId}:`, error);

    await setConversationStatus(conversationId, 'error', message);
    emitAgentEvent(conversationId, { type: 'error', message });
    emitAgentEvent(conversationId, { type: 'turn_end', reason: 'error' });
  } finally {
    clearRunningTurn(conversationId);
  }
}

/**
 * Relevant past work, pulled in before the model sees the question.
 *
 * Failing to recall is never a reason to fail the turn -- the agent simply works
 * without the context it would have had.
 */
async function retrieveContext(text: string): Promise<string | null> {
  try {
    const result = await recall(text, { limit: 4 });
    if (result.hits.length === 0) return null;

    return [
      '<retrieved_context>',
      'Previously recorded work that may be relevant. Treat it as background, and',
      'verify anything you rely on against the current data.',
      ...result.hits.map(
        (hit) => `- [${hit.sourceType}${hit.sourceId ? ` ${hit.sourceId}` : ''}] ${hit.content}`
      ),
      '</retrieved_context>',
    ].join('\n');
  } catch {
    return null;
  }
}

/** Appends the user's message and starts a turn. Returns as soon as it is under way. */
export async function startAgentTurn(
  conversationId: string,
  options: StartTurnOptions
): Promise<void> {
  const conversation = await getConversation(conversationId);

  if (conversation.status === 'running') {
    /**
     * A turn that no longer exists.
     *
     * `running` is written to the database, but the loop driving it lives in
     * this process. A restart -- a deploy, or a hot reload in development --
     * takes the loop with it and leaves the row saying running forever, and the
     * guard then rejected every later message with "already working on a
     * reply". The conversation was bricked with no way back.
     *
     * The registry is the ground truth for whether a turn is actually alive
     * here. If nothing is registered and the row has not been touched for a
     * while, it belongs to a process that is gone and can be reclaimed. The
     * delay is there so a turn that genuinely just started in another worker is
     * not stolen out from under it.
     */
    const abandoned =
      !isTurnRunning(conversationId) &&
      Date.now() - new Date(conversation.updatedAt).getTime() > STALE_TURN_MS;

    if (!abandoned) {
      throw new ValidationError('This conversation is already working on a reply.');
    }

    console.warn(
      `[agent] Conversation ${conversationId} was left running by a process that ` +
        'is no longer here. Reclaiming it.'
    );
    await setConversationStatus(conversationId, 'idle');
  }

  const text = options.text.trim();
  if (!text) throw new ValidationError('Message cannot be empty.');

  await sweepStaleToolCalls(conversationId);

  const settings = await loadAgentSettings();

  // Retrieved context goes into the user message, never the system prompt: the
  // system prompt is the cached prefix and must stay byte-stable.
  const message = await appendMessage({
    conversationId,
    role: 'user',
    kind: 'chat',
    content: [{ type: 'text', text }],
    providerName: settings.provider,
    model: settings.model,
  });

  emitAgentEvent(conversationId, {
    type: 'message',
    messageId: message.id,
    role: 'user',
    kind: 'chat',
    content: message.content,
  });

  // Retrieval happens after the message is persisted and emitted, so a slow
  // embedding provider cannot delay the user seeing their own message.
  const retrieved = await retrieveContext(text);

  // Deliberately not awaited: the loop outlives the request that started it.
  void drive(conversationId, options.role ?? 'orchestrator', retrieved);
}

/**
 * Run the last turn again, without the user having to retype anything.
 *
 * A failed turn is almost always the provider refusing the request -- a missing
 * or expired key, a model name the endpoint does not know, a rate limit, a
 * network blip. None of that is the user's fault and none of it is in what they
 * wrote, so making them reconstruct the message to try again is pure friction.
 * Their message is already persisted; the turn simply has to be driven again.
 *
 * The one thing that cannot be replayed blindly is a failure that landed after
 * the model had already asked for tools. That leaves an assistant message
 * carrying tool_use blocks with no matching tool_result, which is a 400 from
 * Anthropic and quietly derails an OpenAI-compatible server. Resuming is the
 * operation that fills those in, so that case is handed to it instead.
 */
export async function retryAgentTurn(
  conversationId: string,
  options: { role?: RoleName } = {}
): Promise<void> {
  const conversation = await getConversation(conversationId);

  if (conversation.status === 'running' && isTurnRunning(conversationId)) {
    throw new ValidationError('This conversation is already working on a reply.');
  }

  if (conversation.status === 'awaiting_approval') {
    throw new ValidationError('Decide the pending actions first.');
  }

  const history = await getMessages(conversationId);
  const last = history[history.length - 1];
  if (!last) throw new ValidationError('There is nothing to retry yet.');

  // Anything a dead process left mid-call, so resuming does not wait on a tool
  // that is never coming back.
  await sweepStaleToolCalls(conversationId);
  await setConversationStatus(conversationId, 'idle');

  const dangling = last.role === 'assistant' ? toolUseBlocks(last.content as LlmBlock[]) : [];

  if (dangling.length > 0) {
    /**
     * A call the model asked for that was never even written down.
     *
     * The turn can die between the provider returning a tool_use block and the
     * platform recording the row for it. Resuming works from the rows, so such
     * a call would be skipped -- and a tool_use with no matching tool_result is
     * exactly the thing that 400s. Recorded now as an already-failed call, so
     * the model is told what happened instead of the payload being malformed.
     */
    const known = new Set(
      (await getToolCallsForMessage(last.id)).map((row) => row.toolUseId)
    );

    for (const call of dangling) {
      if (known.has(call.id)) continue;

      const row = await recordToolCall({
        conversationId,
        messageId: last.id,
        toolUseId: call.id,
        toolName: call.name,
        input: call.input,
        riskLevel: getTool(call.name)?.risk ?? 'execute',
        requiresApproval: false,
      });

      await completeToolCall(row.id, {
        content: 'Error: the turn failed before this call could run.',
        isError: true,
        durationMs: 0,
      });
    }

    void resumeAgentTurn(conversationId, last.id).catch((error) => {
      const message = error instanceof Error ? error.message : 'The turn could not be resumed.';
      void setConversationStatus(conversationId, 'error', message);
      emitAgentEvent(conversationId, { type: 'error', message });
      emitAgentEvent(conversationId, { type: 'turn_end', reason: 'error' });
    });
    return;
  }

  // The same retrieval the original turn would have done, from the same text.
  const lastUserText = [...history]
    .reverse()
    .find((message) => message.role === 'user' && message.kind === 'chat')
    ?.content?.find((block) => block.type === 'text')?.text;

  const retrieved = lastUserText ? await retrieveContext(lastUserText) : null;

  void drive(conversationId, options.role ?? 'orchestrator', retrieved);
}

/**
 * Continue a suspended turn once every pending call has been decided.
 *
 * Approved calls run; declined ones still produce a tool_result saying so. A
 * tool_use left without a matching result is a 400 from Anthropic and quietly
 * derails OpenAI-compatible servers, so nothing may be dropped here.
 */
export async function resumeAgentTurn(conversationId: string, messageId: string): Promise<void> {
  const rows = await getToolCallsForMessage(messageId);
  if (rows.some((row) => row.status === 'pending')) return;

  const settings = await loadAgentSettings();
  const controller = registerRunningTurn(conversationId);

  try {
    await setConversationStatus(conversationId, 'running');

    const results: LlmBlock[] = [];
    for (const row of rows) {
      if (row.status === 'rejected') {
        results.push(declinedResult(row.toolUseId, row.decisionNote));
        continue;
      }

      if (row.status === 'succeeded' || row.status === 'failed') {
        const stored = (row.resultContent as { text?: string } | null)?.text ?? '';
        results.push({
          type: 'tool_result',
          toolUseId: row.toolUseId,
          content: stored,
          isError: row.isError,
        });
        continue;
      }

      results.push(await executeToolCall(conversationId, row));
    }

    const toolMessage = await appendMessage({
      conversationId,
      role: 'user',
      kind: 'tool_results',
      content: results,
      providerName: settings.provider,
      model: settings.model,
    });

    emitAgentEvent(conversationId, {
      type: 'message',
      messageId: toolMessage.id,
      role: 'user',
      kind: 'tool_results',
      content: results,
    });

    const reason = await runLoop(conversationId, 'orchestrator', controller.signal);
    if (reason !== 'awaiting_approval') await setConversationStatus(conversationId, 'idle');
    emitAgentEvent(conversationId, { type: 'turn_end', reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The agent failed to resume.';
    console.error(`Agent resume failed for conversation ${conversationId}:`, error);
    await setConversationStatus(conversationId, 'error', message);
    emitAgentEvent(conversationId, { type: 'error', message });
    emitAgentEvent(conversationId, { type: 'turn_end', reason: 'error' });
  } finally {
    clearRunningTurn(conversationId);
  }
}

export function cancelAgentTurn(conversationId: string): boolean {
  const cancelled = cancelRunningTurn(conversationId);
  if (cancelled) {
    void setConversationStatus(conversationId, 'idle');
    emitAgentEvent(conversationId, { type: 'turn_end', reason: 'cancelled' });
  }
  return cancelled;
}

/** A short title generated from the opening message, so the sidebar is readable. */
export async function generateConversationTitle(text: string): Promise<string | null> {
  try {
    const settings = await loadAgentSettings();
    const provider = createProvider(settings);

    const turn = await provider.chat(
      [{ role: 'user', content: [{ type: 'text', text: `${CONVERSATION_TITLE_PROMPT}\n\n${text}` }] }],
      { maxTokens: 32, effort: 'low' }
    );

    const title = turn.blocks
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '');

    return title.length > 0 ? title.slice(0, 80) : null;
  } catch {
    // A missing title is cosmetic; never let it fail the turn.
    return null;
  }
}
