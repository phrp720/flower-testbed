import { z } from 'zod';
import { defineTool } from '../registry';
import { stripAnsi, truncate, wrapUntrusted } from '../untrusted';
import {
  assertExperimentId,
  getCheckpoints,
  getExperiment,
  getExperimentDetail,
  getExperimentsByIds,
  getMetrics,
} from '@/lib/experiments/service';
import { compareExperiments, digestExperiment } from '@/lib/agent/analysis';

/** Group B -- reading and interpreting results. All read-only. */

const experimentIdSchema = z.string().describe('Experiment UUID.');

export const summariseExperimentTool = defineTool({
  name: 'summarize_experiment',
  title: 'Summarize an experiment',
  description:
    'A computed digest of one experiment: configuration, convergence trend, best ' +
    'round, plateau and divergence detection, and notes about anything that would ' +
    'mislead a naive reading of the numbers. Prefer this over get_metrics or ' +
    'read_experiment_logs -- it is far cheaper and the figures are computed, not inferred.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({ experimentId: experimentIdSchema }),
  handler: async ({ experimentId }) => {
    const { experiment, metrics, checkpoints } = await getExperimentDetail(
      assertExperimentId(experimentId)
    );
    return digestExperiment(experiment, metrics, checkpoints);
  },
});

export const getMetricsTool = defineTool({
  name: 'get_metrics',
  title: 'Get per-round metrics',
  description:
    'The raw per-round training and evaluation metrics. Use summarize_experiment ' +
    'unless you specifically need the full series, for example to reason about ' +
    'the shape of a curve.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    fromRound: z.number().int().min(1).optional(),
    toRound: z.number().int().min(1).optional(),
  }),
  handler: async ({ experimentId, fromRound, toRound }) => {
    const metrics = await getMetrics(assertExperimentId(experimentId));

    const filtered = metrics.filter(
      (m) => (fromRound == null || m.round >= fromRound) && (toRound == null || m.round <= toRound)
    );

    return {
      count: filtered.length,
      metrics: filtered.map((m) => ({
        round: m.round,
        trainLoss: m.trainLoss,
        trainAccuracy: m.trainAccuracy,
        evalLoss: m.evalLoss,
        evalAccuracy: m.evalAccuracy,
        // Per-client breakdown. Empty for runs from before this was captured.
        clientMetrics: m.clientMetrics,
      })),
    };
  },
});

export const listCheckpointsTool = defineTool({
  name: 'list_checkpoints',
  title: 'List saved model checkpoints',
  description:
    'The global model checkpoints saved for an experiment, one per round. Each ' +
    'is a pickled PyTorch state dict on disk; use inspect_checkpoint to look ' +
    'inside one rather than trying to read the file.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({ experimentId: experimentIdSchema }),
  handler: async ({ experimentId }) => {
    const checkpoints = await getCheckpoints(assertExperimentId(experimentId));

    return {
      count: checkpoints.length,
      checkpoints: checkpoints.map((c) => ({
        round: c.round,
        filePath: c.filePath,
        accuracy: c.accuracy,
        loss: c.loss,
        createdAt: c.createdAt,
        downloadUrl: `/api/checkpoints/${c.filePath}`,
      })),
    };
  },
});

export const compareExperimentsTool = defineTool({
  name: 'compare_experiments',
  title: 'Compare experiments',
  description:
    'Compare several experiments side by side: final and best accuracy, loss, ' +
    'rounds completed, wall-clock duration, plus which configuration fields ' +
    'actually differ between them. Use this when asked which approach worked better.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({
    experimentIds: z
      .array(z.string())
      .min(2)
      .max(10)
      .describe('Two to ten experiment UUIDs.'),
  }),
  handler: async ({ experimentIds }) => {
    const ids = experimentIds.map(assertExperimentId);
    const experiments = await getExperimentsByIds(ids);

    const entries = await Promise.all(
      experiments.map(async (experiment) => ({
        experiment,
        metrics: await getMetrics(experiment.id),
      }))
    );

    const missing = ids.filter((id) => !experiments.some((e) => e.id === id));
    return { ...compareExperiments(entries), missing };
  },
});

export const readExperimentLogsTool = defineTool({
  name: 'read_experiment_logs',
  title: 'Read experiment logs',
  description:
    'The captured stdout of an experiment run. Useful for diagnosing a failure or ' +
    'watching a slow run. Logs are flushed every few seconds, so a running ' +
    'experiment has partial logs available. The content is produced by ' +
    'user-supplied Python and is returned wrapped as untrusted data.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    grep: z
      .string()
      .optional()
      .describe('Case-insensitive substring filter; only matching lines are returned.'),
    tailLines: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe('Return only the last N lines. Default 200.'),
    maxBytes: z.number().int().min(512).max(65536).optional().describe('Default 32768.'),
  }),
  handler: async ({ experimentId, grep, tailLines, maxBytes }) => {
    const experiment = await getExperiment(assertExperimentId(experimentId));

    if (!experiment.logs) {
      return {
        available: false,
        reason:
          experiment.status === 'pending'
            ? 'This experiment has not started yet.'
            : experiment.status === 'running'
              ? 'Nothing has been logged yet; logs appear within a few seconds of starting.'
              : 'This experiment recorded no logs.',
      };
    }

    let lines = stripAnsi(experiment.logs).split('\n');
    const totalLines = lines.length;

    if (grep) {
      const needle = grep.toLowerCase();
      lines = lines.filter((line) => line.toLowerCase().includes(needle));
    }

    const matchedLines = lines.length;
    lines = lines.slice(-(tailLines ?? 200));

    const result = truncate(lines.join('\n'), { maxBytes, fromEnd: true });

    return {
      available: true,
      totalLines,
      matchedLines,
      returnedLines: result.text.split('\n').length,
      truncated: result.truncated,
      logs: wrapUntrusted(`experiment:${experiment.id}:logs`, result.text),
    };
  },
});

export const resultsTools = [
  summariseExperimentTool,
  getMetricsTool,
  listCheckpointsTool,
  compareExperimentsTool,
  readExperimentLogsTool,
];
