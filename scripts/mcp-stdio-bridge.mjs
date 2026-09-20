#!/usr/bin/env node
/**
 * stdio <-> Streamable HTTP bridge for the Flower Testbed MCP server.
 *
 * Some MCP hosts can only launch a local command and cannot attach an
 * Authorization header to a remote HTTP server. This bridge gives them a stdio
 * server that forwards every message to /api/mcp with the bearer token applied.
 *
 * If your host does support remote HTTP with headers, skip this and point it
 * straight at the endpoint:
 *
 *   claude mcp add flower-testbed --transport http http://localhost:3000/api/mcp \
 *     --header "Authorization: Bearer <token>"
 *
 * Usage:
 *   FLOWER_MCP_TOKEN=ftb_... node scripts/mcp-stdio-bridge.mjs [url]
 *
 * Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "flower-testbed": {
 *         "command": "node",
 *         "args": ["/abs/path/to/scripts/mcp-stdio-bridge.mjs"],
 *         "env": { "FLOWER_MCP_TOKEN": "ftb_..." }
 *       }
 *     }
 *   }
 */

import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const url = process.argv[2] ?? process.env.FLOWER_MCP_URL ?? 'http://localhost:3000/api/mcp';
const token = process.env.FLOWER_MCP_TOKEN;

if (!token) {
  // stderr, never stdout: stdout is the JSON-RPC channel.
  console.error(
    'FLOWER_MCP_TOKEN is not set. Create a token in the testbed under Settings > MCP access.'
  );
  process.exit(1);
}

const upstream = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

const downstream = new StdioServerTransport();

// A plain message pump in both directions. The bridge deliberately understands
// nothing about the protocol, so it never needs updating when the schema moves.
downstream.onmessage = (message) => {
  upstream.send(message).catch((error) => {
    console.error('[bridge] failed to forward to server:', error?.message ?? error);
  });
};

upstream.onmessage = (message) => {
  downstream.send(message).catch((error) => {
    console.error('[bridge] failed to forward to host:', error?.message ?? error);
  });
};

const shutdown = async () => {
  await Promise.allSettled([upstream.close(), downstream.close()]);
  process.exit(0);
};

downstream.onclose = shutdown;
upstream.onclose = shutdown;
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

upstream.onerror = (error) => console.error('[bridge] upstream error:', error?.message ?? error);
downstream.onerror = (error) => console.error('[bridge] stdio error:', error?.message ?? error);

await upstream.start();
await downstream.start();

console.error(`[bridge] forwarding stdio to ${url}`);
