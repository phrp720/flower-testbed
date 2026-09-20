import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createExperiment, listExperiments } from '@/lib/experiments/service';

// GET /api/experiments - List all experiments
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const experiments = await listExperiments();
    return NextResponse.json({ experiments });
  } catch (error) {
    return toErrorResponse(error, 'Error fetching experiments', 'Failed to fetch experiments');
  }
}

// POST /api/experiments - Create a new experiment
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const experiment = await createExperiment(await request.json());
    return NextResponse.json({ experiment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, 'Error creating experiment', 'Failed to create experiment');
  }
}
