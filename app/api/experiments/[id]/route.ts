import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import {
  assertExperimentId,
  deleteExperiment,
  getExperimentDetail,
  updateExperiment,
} from '@/lib/experiments/service';

// GET /api/experiments/[id] - Get single experiment with metrics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const detail = await getExperimentDetail(assertExperimentId(id));
    return NextResponse.json(detail);
  } catch (error) {
    return toErrorResponse(error, 'Error fetching experiment', 'Failed to fetch experiment');
  }
}

// PATCH /api/experiments/[id] - Update the configuration of a pending experiment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const experiment = await updateExperiment(assertExperimentId(id), await request.json());
    return NextResponse.json({ experiment });
  } catch (error) {
    return toErrorResponse(error, 'Error updating experiment', 'Failed to update experiment');
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
    await deleteExperiment(assertExperimentId(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error, 'Error deleting experiment', 'Failed to delete experiment');
  }
}
