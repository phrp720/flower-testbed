import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getSession, unauthorized } from '@/lib/auth';
import { stopExperimentExecution } from '@/lib/experiment-runtime';
import { parseExperimentIdParam } from '@/lib/experiment-id';

// POST /api/experiments/[id]/stop - Stop a running experiment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const experimentId = parseExperimentIdParam(id);

    if (!experimentId) {
      return NextResponse.json(
        { error: 'Invalid experiment ID' },
        { status: 400 }
      );
    }

    const [experiment] = await db
      .select()
      .from(schema.experiments)
      .where(eq(schema.experiments.id, experimentId));

    if (!experiment) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      );
    }

    if (experiment.status !== 'running' && experiment.status !== 'pending') {
      return NextResponse.json({
        success: true,
        message: 'Experiment is not running',
      });
    }

    await stopExperimentExecution(experimentId);

    await db
      .update(schema.experiments)
      .set({
        status: 'failed',
        errorMessage: 'Stopped by user',
        completedAt: new Date(),
      })
      .where(eq(schema.experiments.id, experimentId));

    return NextResponse.json({
      success: true,
      message: 'Experiment stopped',
    });
  } catch (error) {
    console.error('Error stopping experiment:', error);
    return NextResponse.json(
      { error: 'Failed to stop experiment' },
      { status: 500 }
    );
  }
}
