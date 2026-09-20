import { z } from 'zod';
import { defineTool } from '../registry';
import { indexExperiment, recall, remember } from '@/lib/agent/memory';
import { assertExperimentId } from '@/lib/experiments/service';

/**
 * Memory tools.
 *
 * What makes an agent useful across sessions is remembering what was already
 * tried. Without it, every conversation re-derives the same conclusions from
 * scratch and proposes experiments that already ran.
 */

export const searchMemoryTool = defineTool({
  name: 'search_memory',
  title: 'Search past work',
  description:
    'Search everything the agent has recorded about previous experiments and ' +
    'insights, by meaning rather than keyword. Use this before proposing an ' +
    'experiment, to check whether something equivalent has already been run.',
  group: 'memory',
  risk: 'read',
  inputSchema: z.object({
    query: z.string().min(1).describe('What you are looking for, in plain language.'),
    sourceTypes: z
      .array(z.enum(['experiment', 'artifact', 'conversation_summary', 'insight']))
      .optional(),
    limit: z.number().int().min(1).max(20).optional().describe('Default 5.'),
  }),
  handler: async ({ query, sourceTypes, limit }) => {
    const result = await recall(query, { sourceTypes, limit });

    return {
      mode: result.mode,
      ...(result.note ? { note: result.note } : {}),
      count: result.hits.length,
      results: result.hits.map((hit) => ({
        sourceType: hit.sourceType,
        sourceId: hit.sourceId,
        name: hit.sourceRef,
        similarity: hit.similarity != null ? Number(hit.similarity.toFixed(4)) : undefined,
        content: hit.content,
      })),
    };
  },
});

export const recordInsightTool = defineTool({
  name: 'record_insight',
  title: 'Record an insight',
  description:
    'Save something worth remembering across conversations -- a conclusion about ' +
    'this dataset, a setting that consistently helps, a failure mode and its cause. ' +
    'Record the reasoning, not just the outcome, so it is still useful later.',
  group: 'memory',
  risk: 'write',
  inputSchema: z.object({
    text: z.string().min(1).describe('The insight, written so it stands on its own.'),
    experimentId: z.string().nullable().optional().describe('The run it came from, if any.'),
    tags: z.array(z.string()).optional(),
  }),
  handler: async ({ text, experimentId, tags }) => {
    const result = await remember({
      sourceType: 'insight',
      sourceId: null,
      sourceRef: tags?.join(', ') ?? null,
      content: text,
      metadata: { experimentId: experimentId ?? null, tags: tags ?? [] },
    });

    return result.stored
      ? { stored: true }
      : {
          stored: false,
          reason: result.reason,
          note: 'Enable embeddings in Settings for the agent to retain insights.',
        };
  },
});

export const indexExperimentTool = defineTool({
  name: 'index_experiment',
  title: 'Add an experiment to memory',
  description:
    'Record an experiment\'s configuration and outcome in memory so it can be ' +
    'recalled later. Finished runs are indexed automatically; this is for ' +
    're-indexing after results change.',
  group: 'memory',
  risk: 'write',
  inputSchema: z.object({ experimentId: z.string().describe('Experiment UUID.') }),
  handler: async ({ experimentId }) => indexExperiment(assertExperimentId(experimentId)),
});

export const memoryTools = [searchMemoryTool, recordInsightTool, indexExperimentTool];
