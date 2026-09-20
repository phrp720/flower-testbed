import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { assertExperimentId } from '@/lib/experiments/service';
import { getModelView } from '@/lib/experiments/model-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET - how this experiment's model can be shown, and the data to show it.
 *
 * The tool decides from a real batch and the model's own structure whether that
 * is a decision surface, its first-layer kernels, or neither. The caller does
 * not say which it wants, because the experiment's config is not a reliable
 * description of what the data actually is.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const resolution = request.nextUrl.searchParams.get('resolution');
    const maxSamples = request.nextUrl.searchParams.get('maxSamples');

    const view = await getModelView(assertExperimentId(id), {
      resolution: resolution ? Number.parseInt(resolution, 10) : undefined,
      maxSamples: maxSamples ? Number.parseInt(maxSamples, 10) : undefined,
      clientId: request.nextUrl.searchParams.get('clientId'),
    });

    return NextResponse.json(view);
  } catch (error) {
    return toErrorResponse(error, 'Error building model view', 'Failed to build model view');
  }
}
