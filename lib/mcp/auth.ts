import { getSession } from '@/lib/auth';
import type { ToolScope } from './registry';
import { verifyApiToken } from './tokens';

/**
 * Two ways in, because the callers are genuinely different.
 *
 * The browser and the in-app agent arrive with a NextAuth session cookie. An
 * external MCP host -- Claude Desktop, Claude Code -- cannot carry that cookie,
 * so it presents a bearer token instead.
 */

export interface McpPrincipal {
  kind: 'session' | 'token';
  scope: ToolScope;
  label: string;
}

export async function authenticateMcpRequest(request: Request): Promise<McpPrincipal | null> {
  const header = request.headers.get('authorization');

  if (header?.toLowerCase().startsWith('bearer ')) {
    const verified = await verifyApiToken(header.slice(7).trim());
    if (!verified) return null;
    return { kind: 'token', scope: verified.scopes, label: verified.name };
  }

  const session = await getSession();
  if (session) return { kind: 'session', scope: 'write', label: 'session' };

  return null;
}

export function unauthorizedMcpResponse(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="flower-testbed"',
      },
    }
  );
}
