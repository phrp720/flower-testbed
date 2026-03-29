import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getSession, unauthorized } from '@/lib/auth';
import { parseExperimentIdParam } from '@/lib/experiment-id';
import {
  ensureExperimentRuntimeDirs,
  getExperimentCapacity,
  startExperimentExecution,
} from '@/lib/experiment-runtime';

// POST /api/experiments/[id]/start - Start an experiment
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

    // Fetch experiment
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

    if (experiment.status === 'running') {
      return NextResponse.json(
        { error: 'Experiment is already running' },
        { status: 400 }
      );
    }

    const capacity = await getExperimentCapacity({ excludeExperimentId: experimentId });
    if (!capacity.canCreateExperiment) {
      return NextResponse.json(
        {
          error: `All experiment worker slots are busy (${capacity.activeExperiments}/${capacity.maxConcurrentExperiments}). Try again when a slot is free.`,
        },
        { status: 409 }
      );
    }

    // Update status to running
    await db
      .update(schema.experiments)
      .set({
        status: 'running',
        startedAt: new Date(),
      })
      .where(eq(schema.experiments.id, experimentId));

    // Create checkpoint directory for this experiment
    await ensureExperimentRuntimeDirs(experimentId);

    // Start the experiment in the background and fail fast on startup errors
    try {
      await startExperimentExecution(experimentId);
    } catch (startupError) {
      await db
        .update(schema.experiments)
        .set({
          status: 'failed',
          errorMessage: startupError instanceof Error ? startupError.message : 'Flower runner failed to start',
          completedAt: new Date(),
        })
        .where(eq(schema.experiments.id, experimentId));
      throw startupError;
    }

    return NextResponse.json({
      success: true,
      message: 'Experiment started',
      experimentId,
    });
  } catch (error) {
    console.error('Error starting experiment:', error);
    return NextResponse.json(
      { error: 'Failed to start experiment' },
      { status: 500 }
    );
  }
}
