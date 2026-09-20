import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import {
  deleteConversation,
  getConversation,
  getMessages,
  getPendingToolCalls,
  sweepStaleToolCalls,
  updateConversation,
} from '@/lib/agent/conversations';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { asc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET - the whole thread: conversation, messages and every tool call
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;

    // Recover anything a dead process left mid-flight before reporting state.
    await sweepStaleToolCalls(id);

    const [conversation, messages, pending] = await Promise.all([
      getConversation(id),
      getMessages(id),
      getPendingToolCalls(id),
    ]);

    const toolCalls = await db
      .select()
      .from(schema.agentToolCalls)
      .where(eq(schema.agentToolCalls.conversationId, id))
      .orderBy(asc(schema.agentToolCalls.createdAt));

    return NextResponse.json({
      conversation,
      messages,
      toolCalls,
      pendingToolCallIds: pending.map((row) => row.id),
    });
  } catch (error) {
    return toErrorResponse(error, 'Error loading conversation', 'Failed to load conversation');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const conversation = await updateConversation(id, await request.json());
    return NextResponse.json({ conversation });
  } catch (error) {
    return toErrorResponse(error, 'Error updating conversation', 'Failed to update conversation');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    await deleteConversation(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error, 'Error deleting conversation', 'Failed to delete conversation');
  }
}
