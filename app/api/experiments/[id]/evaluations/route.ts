import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { assertExperimentId } from '@/lib/experiments/service';
import { planDriftAnalysis, runEvaluation } from '@/lib/experiments/evaluations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A forward pass over a data partition; minutes, not seconds.
export const maxDuration = 300;

// GET - which models and partitions make up a drift analysis, and what is already computed
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const round = request.nextUrl.searchParams.get('round');

    return NextResponse.json(
      await planDriftAnalysis(
        assertExperimentId(id),
        round ? Number.parseInt(round, 10) : undefined
      )
    );
  } catch (error) {
    return toErrorResponse(error, 'Error planning drift analysis', 'Failed to load evaluations');
  }
}

/**
 * POST - evaluate one model against one partition.
 *
 * Deliberately one cell per request rather than the whole matrix: the client
 * fills it in progressively, nothing is lost if the page is closed part-way,
 * and no single request runs for minutes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const body = await request.json();

    const result = await runEvaluation({
      experimentId: assertExperimentId(id),
      round: Number(body.round),
      clientId: body.clientId ?? null,
      partition: Number(body.partition),
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, 'Error running evaluation', 'Failed to run evaluation');
  }
}
