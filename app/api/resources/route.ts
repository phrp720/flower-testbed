import { NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { readResourceSnapshot } from '@/lib/resources';

// GET /api/resources - Get available system resources
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    return NextResponse.json(await readResourceSnapshot());
  } catch (error) {
    return toErrorResponse(error, 'Error fetching resources', 'Failed to fetch system resources');
  }
}
