import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createMcpServer } from '@/lib/mcp/server';
import { getInternalMcpToken } from '@/lib/mcp/internal-token';
import type { LlmToolDef } from '@/lib/llm/types';
import { ALL_TOOLS } from '@/lib/mcp/tools';
import { filterToolsByScope, type ToolScope } from '@/lib/mcp/registry';

/**
 * The in-app agent's MCP client.
 *
 * It connects to /api/mcp over Streamable HTTP -- the same endpoint, and the
 * same credential mechanism, that an external client such as Claude Desktop
 * uses. The agent is therefore not a privileged insider with a private path to
 * the tools; it is one MCP client among several, and anything it can do is
 * something an external client with an equivalent token could also do.
 *
 * AGENT_MCP_TRANSPORT=inmemory links a client and server directly instead,
 * skipping the network hop. Useful when the app cannot address itself.
 */

const CLIENT_INFO = { name: 'flower-testbed-agent', version: '0.1.0' } as const;

export type AgentTransport = 'http' | 'inmemory';

let cached: Promise<Client> | null = null;
let activeTransport: AgentTransport | null = null;

function configuredTransport(): AgentTransport {
  return (process.env.AGENT_MCP_TRANSPORT ?? 'http').toLowerCase() === 'inmemory'
    ? 'inmemory'
    : 'http';
}

function internalBaseUrl(): string {
  return process.env.INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

async function connectInMemory(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const server = createMcpServer({ scope: 'write' });
  await server.connect(serverTransport);

  const client = new Client(CLIENT_INFO);
  await client.connect(clientTransport);

  activeTransport = 'inmemory';
  return client;
}

async function connectHttp(): Promise<Client> {
  const token = await getInternalMcpToken();

  const transport = new StreamableHTTPClientTransport(new URL(`${internalBaseUrl()}/api/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });

  const client = new Client(CLIENT_INFO);
  await client.connect(transport);

  activeTransport = 'http';
  return client;
}

async function connect(): Promise<Client> {
  if (configuredTransport() === 'inmemory') return connectInMemory();

  try {
    return await connectHttp();
  } catch (error) {
    // The app could not reach its own endpoint -- a bound address or port the
    // process cannot address, most often. Fall back rather than leaving the
    // agent unusable, but say so loudly: the transport is now not the one the
    // deployment asked for.
    console.warn(
      `[agent] Could not reach the MCP endpoint at ${internalBaseUrl()}/api/mcp ` +
        `(${error instanceof Error ? error.message : String(error)}). ` +
        'Falling back to the in-memory transport. Set INTERNAL_BASE_URL if the ' +
        'app is not reachable at that address.'
    );
    return connectInMemory();
  }
}

export function getMcpClient(): Promise<Client> {
  if (!cached) {
    cached = connect().catch((error) => {
      // Never cache a failed connection, or the process is stuck with it.
      cached = null;
      activeTransport = null;
      throw error;
    });
  }
  return cached;
}

/** Which transport the live client actually negotiated, once connected. */
export function getActiveTransport(): AgentTransport | null {
  return activeTransport;
}

export async function resetMcpClient(): Promise<void> {
  const client = cached;
  cached = null;
  activeTransport = null;
  if (client) await (await client).close().catch(() => {});
}

/**
 * Tool definitions for the model, taken from the live MCP tool list so what the
 * model sees and what the server exposes cannot drift apart.
 */
export async function listAgentTools(scope: ToolScope = 'write'): Promise<LlmToolDef[]> {
  const client = await getMcpClient();
  const { tools } = await client.listTools();

  const allowed = new Set(filterToolsByScope(ALL_TOOLS, scope).map((tool) => tool.name));
  const eager = new Set(ALL_TOOLS.filter((tool) => tool.eagerInput).map((tool) => tool.name));

  return tools
    .filter((tool) => allowed.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: (tool.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
      ...(eager.has(tool.name) ? { eagerInput: true } : {}),
    }));
}

export interface ToolCallOutcome {
  content: string;
  isError: boolean;
}

export async function callAgentTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallOutcome> {
  const client = await getMcpClient();

  try {
    const result = await client.callTool({ name, arguments: args });
    const content = (result.content as Array<{ type: string; text?: string }> | undefined) ?? [];

    return {
      content: content.map((block) => block.text ?? '').join('\n'),
      isError: Boolean(result.isError),
    };
  } catch (error) {
    // A transport-level failure still has to come back as a tool result: the
    // model needs a result for every tool_use it emitted.
    return {
      content: `Error: ${error instanceof Error ? error.message : 'Tool call failed'}`,
      isError: true,
    };
  }
}
