import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

// GET /api/experiments/[id] - Get single experiment with metrics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

// DELETE /api/experiments/[id] - Delete experiment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const experimentId = parseInt(id);

    if (isNaN(experimentId)) {
      return NextResponse.json(
        { error: 'Invalid experiment ID' },
        { status: 400 }
      );
    }

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