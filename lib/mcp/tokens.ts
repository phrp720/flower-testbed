import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { generateToken, hashToken } from '@/lib/crypto/secrets';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { INTERNAL_TOKEN_NAME } from './internal-token';
import type { ToolScope } from './registry';

/**
 * Bearer tokens for external MCP hosts.
 *
 * A NextAuth cookie cannot reach Claude Desktop, so anything outside the browser
 * authenticates with one of these. Only the sha256 digest is stored; the token
 * itself is shown once at creation and is unrecoverable afterwards.
 */

export type ApiToken = typeof schema.agentApiTokens.$inferSelect;

export interface PublicApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: ToolScope;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function toPublic(row: ApiToken): PublicApiToken {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as ToolScope,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export async function listApiTokens(): Promise<PublicApiToken[]> {
  const rows = await db
    .select()
    .from(schema.agentApiTokens)
    .where(
      and(
        isNull(schema.agentApiTokens.revokedAt),
        // The agent's own token is provisioned automatically and rotated on
        // restart; showing it would invite someone to revoke it.
        ne(schema.agentApiTokens.name, INTERNAL_TOKEN_NAME)
      )
    )
    .orderBy(desc(schema.agentApiTokens.createdAt));

  return rows.map(toPublic);
}

export async function createApiToken(input: {
  name?: string;
  scopes?: string;
  expiresAt?: string | null;
}): Promise<{ token: string; record: PublicApiToken }> {
  const name = input.name?.trim();
  if (!name) throw new ValidationError('A name is required so you can tell tokens apart later.');
  if (name === INTERNAL_TOKEN_NAME) {
    throw new ValidationError('That name is reserved for the agent\'s own credential.');
  }

  const scopes = input.scopes ?? 'read';
  if (scopes !== 'read' && scopes !== 'write') {
    throw new ValidationError("scopes must be 'read' or 'write'.");
  }

  const { token, prefix, hash } = generateToken();

  const [row] = await db
    .insert(schema.agentApiTokens)
    .values({
      name,
      tokenHash: hash,
      prefix,
      scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();

  return { token, record: toPublic(row) };
}

export async function revokeApiToken(id: string): Promise<void> {
  const [row] = await db
    .update(schema.agentApiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.agentApiTokens.id, id), isNull(schema.agentApiTokens.revokedAt)))
    .returning();

  if (!row) throw new NotFoundError('Token not found or already revoked.');
}

export interface VerifiedToken {
  id: string;
  name: string;
  scopes: ToolScope;
}

/** Returns null for anything unusable: unknown, revoked or expired. */
export async function verifyApiToken(token: string): Promise<VerifiedToken | null> {
  const [row] = await db
    .select()
    .from(schema.agentApiTokens)
    .where(eq(schema.agentApiTokens.tokenHash, hashToken(token)));

  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  // Best-effort; never let a bookkeeping write fail the request.
  db.update(schema.agentApiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.agentApiTokens.id, row.id))
    .catch(() => {});

  return { id: row.id, name: row.name, scopes: row.scopes as ToolScope };
}
