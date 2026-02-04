import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getSession, unauthorized } from '@/lib/auth';
import { unlink, rm } from 'fs/promises';
import path from 'path';

function getCheckpointsDir(): string {
  return process.env.CHECKPOINTS_DIR || path.join(process.cwd(), 'checkpoints-data');
}

// GET /api/experiments/[id] - Get single experiment with metrics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const experimentId = parseInt(id);

    if (isNaN(experimentId)) {
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

    // Fetch metrics for this experiment
    const metrics = await db
      .select()
      .from(schema.metrics)
      .where(eq(schema.metrics.experimentId, experimentId))
      .orderBy(schema.metrics.round);

    // Fetch checkpoints
    const checkpoints = await db
      .select()
      .from(schema.modelCheckpoints)
      .where(eq(schema.modelCheckpoints.experimentId, experimentId))
      .orderBy(schema.modelCheckpoints.round);

    return NextResponse.json({
      experiment,
      metrics,
      checkpoints,
    });
  } catch (error) {
    console.error('Error fetching experiment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch experiment' },
      { status: 500 }
    );
  }
}

// Helper to safely delete a file
async function safeDeleteFile(filePath: string | null) {
  if (!filePath) return;
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    await unlink(fullPath);
  } catch (error) {
    console.log(`Could not delete file: ${filePath}`);
  }
}

// Helper to safely delete a directory
async function safeDeleteDir(dirPath: string) {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.log(`Could not delete directory: ${dirPath}`);
  }
}

// DELETE /api/experiments/[id] - Delete experiment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const experimentId = parseInt(id);

    if (isNaN(experimentId)) {
      return NextResponse.json(
        { error: 'Invalid experiment ID' },
        { status: 400 }
      );
    }

    // Fetch experiment to get file paths
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

    // Delete uploaded files (algorithm, model, config)
    await safeDeleteFile(experiment.algorithmPath);
    await safeDeleteFile(experiment.modelPath);
    await safeDeleteFile(experiment.configPath);

    // Delete the experiment's checkpoint directory
    const checkpointDir = path.join(getCheckpointsDir(), `exp_${experimentId}`);
    await safeDeleteDir(checkpointDir);

    // Delete experiment from database (cascades to metrics and checkpoints)
    await db
      .delete(schema.experiments)
      .where(eq(schema.experiments.id, experimentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting experiment:', error);
    return NextResponse.json(
      { error: 'Failed to delete experiment' },
      { status: 500 }
    );
  }
}