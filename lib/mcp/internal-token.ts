import { and, eq, isNull, lt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { generateToken } from '@/lib/crypto/secrets';

/**
 * The credential the in-app agent uses to reach its own MCP endpoint.
 *
 * When the agent connects over HTTP it is, from the endpoint's point of view,
 * just another client -- so it needs a bearer token like any other. Requiring
 * the operator to create one by hand would be friction for something that is
 * an implementation detail, so one is provisioned automatically on first use.
 *
 * Only the hash is stored, as with every other token; the plaintext lives in
 * this process's memory for its lifetime, never on disk.
 *
 * Minting deliberately does not revoke the tokens other holders are using. It
 * used to, and that made every hot reload in development mint a token which
 * invalidated the one the already-running agent was holding -- the next tool
 * call came back `-32001 Unauthorized` with no way to recover, because the
 * cached client had no reason to think its credential had died. Anything stale
 * is cleaned up by age instead, and `invalidateInternalMcpToken` lets a caller
 * that actually sees a 401 throw its copy away and ask for a new one.
 */

const INTERNAL_TOKEN_NAME = '__internal_agent__';

let cached: string | null = null;
let pending: Promise<string> | null = null;

/** Anything older than this cannot belong to a live process worth protecting. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

async function provision(): Promise<string> {
  const { token, prefix, hash } = generateToken();

  // Retire only what is old enough to be certainly abandoned. Revoking every
  // sibling would cut off whoever is still using one.
  await db
    .update(schema.agentApiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.agentApiTokens.name, INTERNAL_TOKEN_NAME),
        isNull(schema.agentApiTokens.revokedAt),
        lt(schema.agentApiTokens.createdAt, new Date(Date.now() - STALE_AFTER_MS))
      )
    );

  await db.insert(schema.agentApiTokens).values({
    name: INTERNAL_TOKEN_NAME,
    tokenHash: hash,
    prefix,
    // The agent needs the full tool surface; the approval gate, not the token
    // scope, is what constrains it.
    scopes: 'write',
  });

  return token;
}

export async function getInternalMcpToken(): Promise<string> {
  // An explicitly configured token wins, for deployments that would rather
  // manage the credential themselves.
  const configured = process.env.INTERNAL_MCP_TOKEN;
  if (configured) return configured;

  if (cached) return cached;

  // Guard against two concurrent turns each provisioning a token.
  if (!pending) {
    pending = provision()
      .then((token) => {
        cached = token;
        return token;
      })
      .finally(() => {
        pending = null;
      });
  }

  return pending;
}

/**
 * Forget the cached token so the next call provisions a new one.
 *
 * For a caller that has just been told its credential is not accepted. Without
 * this the process would keep presenting the same dead token forever.
 */
export function invalidateInternalMcpToken(): void {
  cached = null;
  pending = null;
}

export function isInternalTokenName(name: string): boolean {
  return name === INTERNAL_TOKEN_NAME;
}

export { INTERNAL_TOKEN_NAME };
