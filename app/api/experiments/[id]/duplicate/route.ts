import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { assertExperimentId, cloneExperiment } from '@/lib/experiments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST - copy an experiment's configuration into a new pending run.
 *
 * Deliberately does not start it. A duplicate is usually the first step of a
 * change -- a different strategy, another alpha -- and landing in `pending`
 * leaves it editable, which is the only state in which it is. Starting
 * immediately would also spend compute on a decision nobody has made yet.
 *
 * The copy carries the same uploaded module paths rather than duplicating the
 * files: they are content-addressed by name and never rewritten, so two
 * experiments pointing at one file is correct rather than shared mutable state.
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
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : undefined;

    const experiment = await cloneExperiment(assertExperimentId(id), { name });
    return NextResponse.json({ experiment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, 'Error duplicating experiment', 'Failed to duplicate experiment');
  }
}
