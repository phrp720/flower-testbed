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
  registerRunningTurn,
} from './events';
import { buildPreviewSummary } from './preview';
import { buildSystemPrompt, CONVERSATION_TITLE_PROMPT } from './prompts';
import { recall } from './memory';
import { getRole, type RoleName } from './roles';

const MAX_ITERATIONS = Number.parseInt(process.env.AGENT_MAX_ITERATIONS ?? '24', 10) || 24;
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

  const system = buildSystemPrompt({
    role: roleName,
    override: settings.systemPromptOverride,
    autoRun: conversation.autoRun,
  });

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    if (signal.aborted) return 'cancelled';

    const history = await getMessages(conversationId);
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

    // Record every call first, so the approval queue is complete before any of
    // them runs. Otherwise a partially-executed batch is possible.
    const rows: AgentToolCall[] = [];
    for (const call of calls) {
      const descriptor = getTool(call.name);
      const risk = descriptor?.risk ?? 'execute';
      const needsApproval = descriptor ? requiresApproval(descriptor) && !conversation.autoRun : true;

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

    const results: LlmBlock[] = [];
    for (const row of rows) {
      if (signal.aborted) return 'cancelled';
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
    throw new ValidationError('This conversation is already working on a reply.');
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
