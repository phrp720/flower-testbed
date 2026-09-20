import { and, eq, like } from 'drizzle-orm';
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
 * this process's memory for its lifetime. A restart mints a fresh one and
 * retires the previous, so a token is never long-lived and never written to
 * disk.
 */

const INTERNAL_TOKEN_NAME = '__internal_agent__';

let cached: string | null = null;
let pending: Promise<string> | null = null;

async function provision(): Promise<string> {
  const { token, prefix, hash } = generateToken();

  // Retire any token left behind by a previous process.
  await db
    .update(schema.agentApiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.agentApiTokens.name, INTERNAL_TOKEN_NAME),
        eq(schema.agentApiTokens.scopes, 'write')
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

export function isInternalTokenName(name: string): boolean {
  return name === INTERNAL_TOKEN_NAME;
}

export { INTERNAL_TOKEN_NAME };
