import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { ValidationError, toErrorResponse } from '@/lib/errors';
import {
  decideToolCall,
  getToolCall,
  getToolCallsForMessage,
} from '@/lib/agent/conversations';
import { resumeAgentTurn } from '@/lib/agent/runtime';

export const runtime = 'nodejs';

/**
 * POST - approve or reject one pending tool call.
 *
 * The update is conditional on the row still being pending, so a double-click is
 * a no-op rather than a second execution. Once every call attached to the same
 * assistant message has been decided, the suspended turn resumes.
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

    const siblings = await getToolCallsForMessage(updated.messageId!);
    const allDecided = siblings.every((row) => row.status !== 'pending');

    if (allDecided) {
      // Detached: resuming runs the model again and outlives this request.
      void resumeAgentTurn(updated.conversationId, updated.messageId!);
    }

    return NextResponse.json({ toolCall: updated, resumed: allDecided });
  } catch (error) {
    return toErrorResponse(error, 'Error deciding tool call', 'Failed to record decision');
  }
}
