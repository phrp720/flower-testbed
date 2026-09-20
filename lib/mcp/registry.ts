import { z } from 'zod';

/**
 * One descriptor list feeding four consumers: MCP tool registration, the
 * in-app agent's tool list, the approval gate's risk lookup, and scope
 * filtering for read-only API tokens.
 *
 * Handlers return a plain value. The MCP layer serialises it; the agent loop
 * can call the same handler directly. Keeping them free of transport concerns
 * is what lets one implementation serve both.
 */

export type ToolRisk = 'read' | 'write' | 'execute';

export type ToolGroup =
  | 'training'
  | 'results'
  | 'nodes'
  | 'strategy'
  | 'files'
  | 'memory';

export type ToolScope = 'read' | 'write';

export interface ToolDescriptor<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  /**
   * `read` runs freely. `write` and `execute` pass through the approval gate in
   * the in-app agent; an external MCP host applies its own approval UI instead.
   */
  risk: ToolRisk;
  group: ToolGroup;
  /**
   * Large inputs (file bodies) stream as they generate rather than arriving in
   * one burst. Only meaningful for Anthropic, and it shifts input validation to
   * the caller.
   */
  eagerInput?: boolean;
  handler: (input: z.infer<Schema>) => Promise<unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDescriptor = ToolDescriptor<any>;

export function defineTool<Schema extends z.ZodTypeAny>(
  descriptor: ToolDescriptor<Schema>
): AnyToolDescriptor {
  return descriptor as AnyToolDescriptor;
}

export function isReadOnly(tool: AnyToolDescriptor): boolean {
  return tool.risk === 'read';
}

export function requiresApproval(tool: AnyToolDescriptor): boolean {
  return tool.risk !== 'read';
}

/** A read-scoped caller never has the mutating tools registered at all. */
export function filterToolsByScope(
  tools: AnyToolDescriptor[],
  scope: ToolScope
): AnyToolDescriptor[] {
  return scope === 'write' ? tools : tools.filter(isReadOnly);
}

/**
 * Sorted once, here, on purpose: the tool list is part of the prompt-cache
 * prefix, and a non-deterministic order silently destroys every cache hit.
 */
export function sortTools(tools: AnyToolDescriptor[]): AnyToolDescriptor[] {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}

export function toolsByName(tools: AnyToolDescriptor[]): Map<string, AnyToolDescriptor> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}
