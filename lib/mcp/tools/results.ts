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
import { getModelView } from '@/lib/experiments/model-view';
import type { FilterFrame } from '@/lib/python-tools';
import { ValidationError } from '@/lib/errors';

/** Group B -- reading and interpreting results. All read-only. */

const experimentIdSchema = z.string().describe('Experiment UUID.');

export const summariseExperimentTool = defineTool({
  name: 'summarize_experiment',
  title: 'Summarize an experiment',
  description:
    'A computed digest of one experiment: configuration, convergence trend, best ' +
    'round, plateau and divergence detection, and notes about anything that would ' +
    'mislead a naive reading of the numbers. Prefer this over get_metrics or ' +
    'read_experiment_logs -- it is far cheaper and the figures are computed, not inferred. ' +
    'This digest covers convergence only. If the user also asks what to change next, ' +
    'follow it with describe_model_view: the per-class breakdown shows where the error ' +
    'is actually concentrated, which is the difference between a specific ' +
    'recommendation and a generic one.',
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

/**
 * The same answer the experiment page draws, in words.
 *
 * The page renders decision surfaces and convolution kernels as base64 pixel
 * grids; there is no point sending those to a model, which cannot look at them
 * and would pay tens of thousands of tokens for the privilege. What survives
 * the translation is everything that is actually interpretable -- which view the
 * model supports and why, its input shape, its layer sizes or kernel geometry,
 * and, for an image model, how accuracy is distributed across the classes. That
 * last one is the part a person usually wants explained anyway.
 *
 * Served from the same cache as the page, so asking for it after opening the
 * experiment costs nothing, and asking for it first warms the page.
 */
export const describeModelViewTool = defineTool({
  name: 'describe_model_view',
  title: 'Describe what the model learned',
  description:
    'What the experiment page shows under "What the network learned", as numbers ' +
    'rather than pixels: which visualisation the model supports and why, its input ' +
    'shape, hidden layer sizes or first-layer kernel geometry, and -- for image ' +
    'models -- accuracy broken down by class for one round. Use this when asked what ' +
    'a model learned, which classes it confuses, or what the picture means. ' +
    'You cannot see the image, but calling this draws it in the conversation, ' +
    'attached to this call and so sitting just above whatever you write next. ' +
    'Explain what the numbers mean and refer to the picture as shown above -- do ' +
    'not tell the user to go to another page for it, and never write a markdown ' +
    'image: the platform draws it, you do not. First call on a finished run takes ' +
    'a few seconds; later ones are instant.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    round: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Round to break down by class. Defaults to the last saved round.'),
    clientId: z
      .string()
      .optional()
      .describe("Inspect one client's own model instead of the aggregated global one."),
  }),
  handler: async ({ experimentId, round, clientId }) => {
    const id = assertExperimentId(experimentId);
    const experiment = await getExperiment(id);
    const view = await getModelView(id, { clientId: clientId ?? null });

    if (!view.ok) {
      return {
        available: false,
        reason: view.error ?? 'The model could not be inspected.',
      };
    }

    const frames = (view.frames ?? []) as Array<{ round: number }>;
    const common = {
      experimentId: id,
      experimentName: experiment.name,
      view: view.view,
      inputShape: view.inputShape ?? null,
      clientId: view.clientId ?? null,
      roundsAvailable: frames.map((frame) => frame.round),
      /** For the animated round-by-round version, which the inline one is not. */
      pageUrl: `/testbed/experiments/${id}`,
    };

    if (view.view === 'none') {
      return {
        ...common,
        available: false,
        reason: view.reason ?? 'This model has no visualisation the platform can draw.',
      };
    }

    if (view.view === 'surface') {
      const labels = view.labels ?? [];
      return {
        ...common,
        available: true,
        shows:
          'A decision surface: the model classifies every point of the input plane, ' +
          'and each hidden neuron is drawn by how it responds across that same plane.',
        datasetKind: view.datasetKind ?? null,
        hiddenLayerSizes: view.hiddenSizes ?? [],
        inputDomain: view.domain ?? null,
        gridResolution: view.resolution ?? null,
        activationSource: view.activationSource ?? null,
        trainingPoints: (view.points ?? []).length,
        classCount: new Set(labels).size,
        note:
          'The surface has already been drawn for the user, just above your reply. ' +
          'Describe what it means rather than linking them away. Per-round loss and ' +
          'accuracy come from get_metrics.',
      };
    }

    const filterFrames = (view.frames ?? []) as FilterFrame[];
    const chosen = round
      ? filterFrames.find((frame) => frame.round === round)
      : filterFrames[filterFrames.length - 1];

    if (!chosen) {
      throw new ValidationError(
        `Round ${round} has no saved checkpoint. Available: ${common.roundsAvailable.join(', ')}`
      );
    }

    // Ordered worst-first, because the question behind this is almost always
    // which classes the model is getting wrong.
    const perClass = [...chosen.perClass].sort(
      (a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)
    );

    return {
      ...common,
      available: true,
      shows:
        'The first convolution layer\'s kernels -- the small patches the network ' +
        'learned to look for -- alongside accuracy per class.',
      firstConvLayer: view.layerName ?? null,
      kernelShape:
        view.kernelHeight && view.kernelWidth
          ? {
              filters: view.totalFilters ?? null,
              inputChannels: view.inputChannels ?? null,
              height: view.kernelHeight,
              width: view.kernelWidth,
            }
          : null,
      classNames: view.classNames ?? [],
      evaluation: {
        round: chosen.round,
        accuracy: chosen.accuracy,
        samples: view.evalSamples ?? null,
        source: view.evalSource ?? null,
        perClassWorstFirst: perClass,
      },
      note:
        'The kernels and this class breakdown have already been drawn for the user, ' +
        'just above your reply. Describe what they mean rather than linking them ' +
        'away. The accuracy here was ' +
        'measured by this tool over the clients\' own test splits, so it can differ ' +
        'slightly from the round metric reported during training.',
    };
  },
});

export const resultsTools = [
  summariseExperimentTool,
  getMetricsTool,
  listCheckpointsTool,
  compareExperimentsTool,
  readExperimentLogsTool,
  describeModelViewTool,
];
