import { createMcpHandler } from 'mcp-handler';
import { authenticateMcpRequest, unauthorizedMcpResponse } from '@/lib/mcp/auth';
import { SERVER_INFO, SERVER_INSTRUCTIONS } from '@/lib/mcp/server';
import { ToolScope, filterToolsByScope } from '@/lib/mcp/registry';
import { ALL_TOOLS } from '@/lib/mcp/tools';
import { registerResources } from '@/lib/mcp/resources';
import { registerPrompts } from '@/lib/mcp/prompts';
import { isServiceError } from '@/lib/errors';

// pg, node crypto and child_process all rule out the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The MCP endpoint.
 *
 * createMcpHandler returns a plain (Request) => Promise<Response>, which is why
 * this needs no Node req/res shim in the App Router.
 *
 * A handler is built per scope rather than per request, so the tool set a caller
 * sees is fixed by their credential: a read-scoped token never has the mutating
 * tools registered at all.
 */
function buildHandler(scope: ToolScope) {
  return createMcpHandler(
    (server) => {
      for (const tool of filterToolsByScope(ALL_TOOLS, scope)) {
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              readOnlyHint: tool.risk === 'read',
              destructiveHint: tool.risk === 'execute',
            },
          },
          async (input: unknown) => {
            try {
              const result = await tool.handler(input);
              return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (error) {
              const message = isServiceError(error)
                ? error.message
                : error instanceof Error
                  ? error.message
                  : 'Tool execution failed';

              if (!isServiceError(error)) console.error(`MCP tool ${tool.name} failed:`, error);

              return {
                content: [{ type: 'text' as const, text: `Error: ${message}` }],
                isError: true,
              };
            }
          }
        );
      }

      registerResources(server);
      registerPrompts(server);
    },
    { serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS }
  );
}

const handlers: Record<ToolScope, ReturnType<typeof buildHandler>> = {
  read: buildHandler('read'),
  write: buildHandler('write'),
};

async function guarded(request: Request): Promise<Response> {
  const principal = await authenticateMcpRequest(request);
  if (!principal) return unauthorizedMcpResponse();

  return handlers[principal.scope](request);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
