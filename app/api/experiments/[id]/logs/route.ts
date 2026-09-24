import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { assertExperimentId, getExperiment } from '@/lib/experiments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET - the captured logs on their own.
 *
 * Separate from the experiment detail payload because it is the one field that
 * grows without bound, and because it is wanted on a different schedule: the
 * detail is read once on load, the logs are worth re-reading every couple of
 * seconds while a run is live.
 *
 * The runner flushes partial logs to the row as it goes, so this returns what
 * has happened so far rather than only what happened in the end. `status` comes
 * back with it so the caller knows when to stop asking.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const experiment = await getExperiment(assertExperimentId(id));
    const logs = experiment.logs ?? '';

    return NextResponse.json(
      { logs, status: experiment.status, bytes: logs.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error, 'Error reading experiment logs', 'Failed to read logs');
  }
}
