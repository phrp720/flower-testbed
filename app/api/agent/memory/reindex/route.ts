import { NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { reindexAll } from '@/lib/agent/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST - re-embed every experiment.
 *
 * Needed after changing embedding model: vectors from different models are not
 * comparable, so the old rows are dropped and everything is embedded afresh.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    return NextResponse.json(await reindexAll());
  } catch (error) {
    return toErrorResponse(error, 'Error reindexing memory', 'Failed to reindex memory');
  }
}
