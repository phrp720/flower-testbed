import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { assertExperimentId, startExperiment } from '@/lib/experiments/service';

// POST /api/experiments/[id]/start - Start an experiment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const experimentId = assertExperimentId(id);

    await startExperiment(experimentId);

    return NextResponse.json({
      success: true,
      message: 'Experiment started',
      experimentId,
    });
  } catch (error) {
    return toErrorResponse(error, 'Error starting experiment', 'Failed to start experiment');
  }
}
