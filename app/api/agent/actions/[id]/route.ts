import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { ValidationError, toErrorResponse } from '@/lib/errors';
import {
  decideToolCall,
  getToolCall,
  getToolCallsForMessage,
  setConversationStatus,
  updateConversation,
} from '@/lib/agent/conversations';
import { resumeAgentTurn } from '@/lib/agent/runtime';

export const runtime = 'nodejs';

/**
 * POST - approve or reject one pending tool call.
 *
 * The update is conditional on the row still being pending, so a double-click is
 * a no-op rather than a second execution. Once every call attached to the same
 * assistant message has been decided, the suspended turn resumes.
 *
 * `approveAll` additionally grants the rest of this conversation. It is scoped
 * to the conversation and never to the saved default: consenting to a request
 * you can see should not quietly change how every future conversation behaves.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const decision = body.decision;

    if (decision !== 'approve' && decision !== 'reject') {
      throw new ValidationError("decision must be 'approve' or 'reject'.");
    }

    const approveAll = decision === 'approve' && body.approveAll === true;

    const updated = await decideToolCall(
      id,
      decision === 'approve' ? 'approved' : 'rejected',
      typeof body.note === 'string' ? body.note : null
    );

    if (!updated) {
      // Already decided -- report the current state rather than erroring, so a
      // duplicate click from a second tab is harmless.
      const current = await getToolCall(id);
      return NextResponse.json({ toolCall: current, alreadyDecided: true });
    }

    // Set before the turn resumes, so the loop's re-read of autoRun already
    // sees it and the remaining calls in this turn go straight through.
    if (approveAll) {
      await updateConversation(updated.conversationId, { autoRun: true });
    }

    const siblings = await getToolCallsForMessage(updated.messageId!);
    const allDecided = siblings.every((row) => row.status !== 'pending');

    if (allDecided) {
      // Marked running before detaching, so the response this client is already
      // waiting on carries the new status. resumeAgentTurn sets it too, but it
      // does so after this request has returned -- which left the UI with no
      // sign the agent was working until the next poll caught up, seconds later.
      await setConversationStatus(updated.conversationId, 'running');

      // Detached: resuming runs the model again and outlives this request.
      void resumeAgentTurn(updated.conversationId, updated.messageId!);
    }

    return NextResponse.json({ toolCall: updated, resumed: allDecided });
  } catch (error) {
    return toErrorResponse(error, 'Error deciding tool call', 'Failed to record decision');
  }
}
