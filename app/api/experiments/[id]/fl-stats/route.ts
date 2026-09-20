import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { assertExperimentId } from '@/lib/experiments/service';
import { buildFlStats } from '@/lib/experiments/fl-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET - the per-round federated series behind the charts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    return NextResponse.json(await buildFlStats(assertExperimentId(id)));
  } catch (error) {
    return toErrorResponse(error, 'Error building FL stats', 'Failed to load statistics');
  }
}
