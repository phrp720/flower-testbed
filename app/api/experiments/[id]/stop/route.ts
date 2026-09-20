import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { assertExperimentId, stopExperiment } from '@/lib/experiments/service';

// POST /api/experiments/[id]/stop - Stop a running experiment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const { message } = await stopExperiment(assertExperimentId(id));
    return NextResponse.json({ success: true, message });
  } catch (error) {
    return toErrorResponse(error, 'Error stopping experiment', 'Failed to stop experiment');
  }
}
