import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET - can the app still reach Postgres?
 *
 * Every page here is a view onto the database, so when it goes away the UI does
 * not fail loudly: queries reject, React Query keeps the last good data, and
 * the screen quietly shows figures that stopped being true some minutes ago.
 * That is worse than an error, because nothing looks wrong.
 *
 * Behind the session even though it reports on infrastructure: the reply
 * carries the driver's own error text, which names hosts and ports. The session
 * is a JWT and is validated without touching the database, so this still
 * answers when Postgres is the thing that is down.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const startedAt = Date.now();

  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { database: 'up', latencyMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        database: 'down',
        error: error instanceof Error ? error.message : 'Unknown database error',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
