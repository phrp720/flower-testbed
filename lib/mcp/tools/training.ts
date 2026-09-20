import { z } from 'zod';
import { defineTool } from '../registry';
import {
  assertExperimentId,
  buildExperimentSnapshot,
  describeExperimentOutcome,
  getExperiment,
  listExperiments,
} from '@/lib/experiments/service';
import { getExperimentCapacity } from '@/lib/experiment-runtime';
import { readResourceSnapshot } from '@/lib/resources';
import { EXPERIMENT_STATUSES } from '@/lib/experiments/service';
import { indexExperiment } from '@/lib/agent/memory';

/**
 * Group A -- initialising and controlling training.
 *
 * Read-only members only; the mutating ones (create/clone/start/stop/delete)
 * are registered alongside the approval gate.
 */

const experimentIdSchema = z
  .string()
  .describe('Experiment UUID, as returned by list_experiments.');

export const listExperimentsTool = defineTool({
  name: 'list_experiments',
  title: 'List experiments',
  description:
    'List federated learning experiments, newest first, with their status, ' +
    'hyperparameters and final metrics. Start here when the user refers to ' +
    '"my last run" or "the experiment I just did".',
  group: 'training',
  risk: 'read',
  inputSchema: z.object({
    status: z
      .enum(EXPERIMENT_STATUSES)
      .optional()
      .describe('Only experiments in this status. Note a user-stopped run is recorded as "failed".'),
    framework: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional().describe('Default 20.'),
    offset: z.number().int().min(0).optional(),
  }),
  handler: async ({ status, framework, limit, offset }) => {
    const experiments = await listExperiments({
      status,
      framework,
      limit: limit ?? 20,
      offset,
    });

    return {
      count: experiments.length,
      experiments: experiments.map((e) => ({
        id: e.id,
        name: e.name,
        framework: e.framework,
        status: e.status,
        outcome: describeExperimentOutcome(e).outcome,
        numClients: e.numClients,
        numRounds: e.numRounds,
        clientFraction: e.clientFraction,
        localEpochs: e.localEpochs,
        learningRate: e.learningRate,
        finalAccuracy: e.finalAccuracy,
        finalLoss: e.finalLoss,
        createdAt: e.createdAt,
        completedAt: e.completedAt,
      })),
    };
  },
});

export const getExperimentStatusTool = defineTool({
  name: 'get_experiment_status',
  title: 'Get live experiment status',
  description:
    'A compact live snapshot of one experiment: status, current round out of ' +
    'total, and the latest metrics. This is the same data the experiment page ' +
    'streams, so it reflects exactly what the user is looking at.',
  group: 'training',
  risk: 'read',
  inputSchema: z.object({ experimentId: experimentIdSchema }),
  handler: async ({ experimentId }) => {
    const snapshot = await buildExperimentSnapshot(assertExperimentId(experimentId));
    if (!snapshot) return { found: false };

    return {
      found: true,
      ...snapshot.experiment,
      latestMetrics: snapshot.latestMetrics,
      checkpointCount: snapshot.checkpoints.length,
    };
  },
});

export const waitForRoundTool = defineTool({
  name: 'wait_for_round',
  title: 'Wait for training to advance',
  description:
    'Block until the experiment reaches a given round or finishes, then return ' +
    'its snapshot. Use this instead of polling get_experiment_status in a loop ' +
    'while waiting for training: it costs one tool call rather than many.',
  group: 'training',
  risk: 'read',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    round: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Round to wait for. Omit to wait for the run to finish.'),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(120000)
      .optional()
      .describe('Give up after this long and return the current state. Default 60000, max 120000.'),
  }),
  handler: async ({ experimentId, round, timeoutMs }) => {
    const id = assertExperimentId(experimentId);
    const deadline = Date.now() + (timeoutMs ?? 60000);
    const pollIntervalMs = 2000;

    for (;;) {
      const snapshot = await buildExperimentSnapshot(id);
      if (!snapshot) return { found: false };

      const terminal =
        snapshot.experiment.status === 'completed' || snapshot.experiment.status === 'failed';
      const reachedRound = round != null && snapshot.experiment.currentRound >= round;

      if (terminal || reachedRound || Date.now() >= deadline) {
        // A finished run is worth remembering. Best-effort: memory is an
        // enhancement, and failing to index must not fail the wait.
        if (terminal) await indexExperiment(id).catch(() => {});

        return {
          found: true,
          reason: terminal ? 'finished' : reachedRound ? 'reached_round' : 'timeout',
          ...snapshot.experiment,
          latestMetrics: snapshot.latestMetrics,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  },
});

export const getResourcesTool = defineTool({
  name: 'get_resources',
  title: 'Get system resources',
  description:
    'Available CPU and GPU resources and how many experiment worker slots are ' +
    'free. Check this before proposing a configuration that reserves CPUs or GPU ' +
    'fractions per client.',
  group: 'training',
  risk: 'read',
  inputSchema: z.object({}),
  handler: async () => readResourceSnapshot(),
});

export const getCapacityTool = defineTool({
  name: 'get_capacity',
  title: 'Get worker capacity',
  description: 'How many experiments are running and whether another can start right now.',
  group: 'training',
  risk: 'read',
  inputSchema: z.object({}),
  handler: async () => getExperimentCapacity(),
});

export const getExperimentConfigTool = defineTool({
  name: 'get_experiment_config',
  title: 'Get experiment configuration',
  description:
    'Every hyperparameter and uploaded file path for one experiment. Use this ' +
    'before proposing changes, so a clone carries the settings you did not mean to alter.',
  group: 'nodes',
  risk: 'read',
  inputSchema: z.object({ experimentId: experimentIdSchema }),
  handler: async ({ experimentId }) => {
    const experiment = await getExperiment(assertExperimentId(experimentId));

    return {
      id: experiment.id,
      name: experiment.name,
      description: experiment.description,
      framework: experiment.framework,
      status: experiment.status,
      editable: experiment.status === 'pending',
      hyperparameters: {
        numClients: experiment.numClients,
        numRounds: experiment.numRounds,
        clientFraction: experiment.clientFraction,
        localEpochs: experiment.localEpochs,
        learningRate: experiment.learningRate,
      },
      resources: {
        useGpu: experiment.useGpu,
        cpusPerClient: experiment.cpusPerClient,
        gpuFractionPerClient: experiment.gpuFractionPerClient,
      },
      files: {
        algorithmPath: experiment.algorithmPath,
        modelPath: experiment.modelPath,
        datasetPath: experiment.datasetPath,
        configPath: experiment.configPath,
      },
      customConfig: experiment.customConfig,
    };
  },
});

export const trainingTools = [
  listExperimentsTool,
  getExperimentStatusTool,
  waitForRoundTool,
  getResourcesTool,
  getCapacityTool,
  getExperimentConfigTool,
];
