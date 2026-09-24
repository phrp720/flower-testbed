import { z } from 'zod';
import { defineTool } from '../registry';
import { assertScope, assertWritableScope, resolveScoped } from '../paths';
import { ValidationError } from '@/lib/errors';
import {
  assertExperimentId,
  cloneExperiment,
  createExperiment,
  deleteExperiment,
  getExperiment,
  startExperiment,
  stopExperiment,
  updateExperiment,
} from '@/lib/experiments/service';

/**
 * Mutating tools.
 *
 * Every one of these is gated: the in-app agent holds them behind the approval
 * queue, and an external MCP host applies its own approval UI. The gate lives in
 * the caller, not here, so one implementation serves both.
 */

const experimentIdSchema = z.string().describe('Experiment UUID.');

const hyperparameterSchema = {
  numClients: z.number().int().min(1).max(1000).optional(),
  numRounds: z.number().int().min(1).max(1000).optional(),
  clientFraction: z.number().min(0.01).max(1).optional(),
  localEpochs: z.number().int().min(1).max(100).optional(),
  learningRate: z.number().min(0.000001).max(10).optional(),
  useGpu: z.boolean().optional(),
  cpusPerClient: z.number().int().min(1).optional(),
  gpuFractionPerClient: z.number().min(0).max(1).optional(),
};

export const createExperimentTool = defineTool({
  name: 'create_experiment',
  title: 'Create an experiment',
  description:
    'Create a new experiment in the pending state. It does not start until ' +
    'start_experiment is called, so configuration can still be adjusted. To base ' +
    'one on an existing run, prefer clone_experiment.',
  group: 'training',
  risk: 'write',
  inputSchema: z.object({
    name: z.string().min(1).describe('A name you would recognise later.'),
    description: z.string().optional(),
    framework: z.string().default('pytorch'),
    algorithmPath: z.string().nullable().optional().describe('Path to an uploaded strategy module.'),
    modelPath: z.string().nullable().optional(),
    configPath: z.string().nullable().optional(),
    datasetPath: z.string().nullable().optional(),
    ...hyperparameterSchema,
    customConfig: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Extra configuration: strategy, partitioner, client_overrides, ' +
          'save_client_checkpoints. See configure_aggregation and set_partitioning.'
      ),
  }),
  handler: async (input) => {
    const experiment = await createExperiment({ ...input, framework: input.framework ?? 'pytorch' });
    return {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      message: 'Created. Call start_experiment to begin training.',
    };
  },
});

export const cloneExperimentTool = defineTool({
  name: 'clone_experiment',
  title: 'Clone an experiment',
  description:
    'Copy an existing experiment\'s configuration and uploaded files into a new ' +
    'pending run, applying any overrides. This is the right way to run a variant: ' +
    'everything you do not override stays identical, so the comparison stays valid.',
  group: 'training',
  risk: 'write',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    name: z.string().min(1).describe('Name for the new run.'),
    overrides: z
      .object({ ...hyperparameterSchema, customConfig: z.record(z.string(), z.unknown()).optional() })
      .optional()
      .describe('Change one variable at a time so the result stays interpretable.'),
  }),
  handler: async ({ experimentId, name, overrides }) => {
    const experiment = await cloneExperiment(assertExperimentId(experimentId), {
      name,
      overrides: overrides as never,
    });
    return { id: experiment.id, name: experiment.name, status: experiment.status };
  },
});

export const startExperimentTool = defineTool({
  name: 'start_experiment',
  title: 'Start training',
  description:
    'Begin training a pending experiment. This consumes real compute and can run ' +
    'for a long time. Check get_capacity first if several runs are already going.',
  group: 'training',
  risk: 'execute',
  inputSchema: z.object({ experimentId: experimentIdSchema }),
  handler: async ({ experimentId }) => {
    const id = assertExperimentId(experimentId);
    await startExperiment(id);
    return {
      experimentId: id,
      status: 'running',
      message: 'Training started. Use wait_for_round to follow it.',
    };
  },
});

export const stopExperimentTool = defineTool({
  name: 'stop_experiment',
  title: 'Stop training',
  description:
    'Stop a running experiment. Metrics and checkpoints already written are kept. ' +
    'Note the platform records a stopped run as status "failed" with errorMessage ' +
    '"Stopped by user"; the outcome field distinguishes it from a real failure.',
  group: 'training',
  risk: 'execute',
  inputSchema: z.object({ experimentId: experimentIdSchema }),
  handler: async ({ experimentId }) => stopExperiment(assertExperimentId(experimentId)),
});

export const deleteExperimentTool = defineTool({
  name: 'delete_experiment',
  title: 'Delete an experiment',
  description:
    'Permanently delete an experiment with its metrics and checkpoints. Uploaded ' +
    'files are removed only if no other experiment still refers to them.',
  group: 'training',
  risk: 'execute',
  inputSchema: z.object({ experimentId: experimentIdSchema }),
  handler: async ({ experimentId }) => {
    const id = assertExperimentId(experimentId);
    await deleteExperiment(id);
    return { experimentId: id, deleted: true };
  },
});

export const updateExperimentConfigTool = defineTool({
  name: 'update_experiment_config',
  title: 'Update experiment configuration',
  description:
    'Change hyperparameters on a pending experiment. Rejected once it has started, ' +
    'because the worker reads its whole configuration once at startup -- a later ' +
    'write would be accepted and never take effect. Clone a running experiment instead.',
  group: 'nodes',
  risk: 'write',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    patch: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      ...hyperparameterSchema,
      customConfig: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  handler: async ({ experimentId, patch }) => {
    const experiment = await updateExperiment(assertExperimentId(experimentId), patch as never);
    return { id: experiment.id, updated: Object.keys(patch) };
  },
});

export const setExperimentFilesTool = defineTool({
  name: 'set_experiment_files',
  title: 'Attach modules to an experiment',
  description:
    'Point a pending experiment at uploaded or agent-written Python modules. ' +
    'Validate each one with validate_user_module first: a module that does not ' +
    'export what the runner expects fails at load time and wastes the run.',
  group: 'nodes',
  risk: 'write',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    algorithmPath: z.string().nullable().optional(),
    modelPath: z.string().nullable().optional(),
    datasetPath: z.string().nullable().optional(),
    configPath: z.string().nullable().optional(),
  }),
  handler: async ({ experimentId, ...paths }) => {
    const patch = Object.fromEntries(Object.entries(paths).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) throw new ValidationError('No file paths supplied.');

    const experiment = await updateExperiment(assertExperimentId(experimentId), patch as never);
    return {
      id: experiment.id,
      files: {
        algorithmPath: experiment.algorithmPath,
        modelPath: experiment.modelPath,
        datasetPath: experiment.datasetPath,
        configPath: experiment.configPath,
      },
    };
  },
});

/** Merge into customConfig rather than replacing it, so unrelated keys survive. */
async function patchCustomConfig(
  experimentId: string,
  mutate: (config: Record<string, unknown>) => Record<string, unknown>
) {
  const id = assertExperimentId(experimentId);
  const experiment = await getExperiment(id);
  const current = (experiment.customConfig ?? {}) as Record<string, unknown>;
  const updated = await updateExperiment(id, { customConfig: mutate({ ...current }) as never });
  return updated.customConfig as Record<string, unknown>;
}

export const setPartitioningTool = defineTool({
  name: 'set_partitioning',
  title: 'Set data partitioning',
  description:
    'Choose how the dataset is split across clients, along either of two ' +
    'independent axes. Label skew changes who sees which classes: dirichlet ' +
    'with a low alpha (0.5 moderate, 0.1 severe) is the standard non-IID ' +
    'benchmark, while shard and pathological restrict each client to a few ' +
    'classes. Quantity skew leaves the labels alone and changes how much data ' +
    'each client holds: linear, exponential and square grow the partitions with ' +
    'the client index, which is how stragglers and unequal devices are modelled ' +
    'and which gives the largest clients most of the weight under FedAvg. IID ' +
    'is an equal random split -- realistic of nothing, and it makes strategies ' +
    'hard to tell apart. Applies to the default CIFAR-10 loader.',
  group: 'nodes',
  risk: 'write',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    // Mirrors build_partitioner in runner/pytorch/defaults/dataset.py. An
    // unknown kind there degrades silently to IID, so this enum is what stops a
    // typo producing a run that reports success having trained on the wrong
    // split -- it is load-bearing, not just validation.
    kind: z.enum([
      'iid',
      'dirichlet',
      'shard',
      'pathological',
      'linear',
      'exponential',
      'square',
    ]),
    alpha: z.number().min(0.01).max(1000).optional().describe('Dirichlet only. Lower is more skewed.'),
    numShardsPerPartition: z.number().int().min(1).optional().describe('Shard only.'),
    numClassesPerPartition: z.number().int().min(1).optional().describe('Pathological only.'),
    seed: z
      .number()
      .int()
      .optional()
      .describe('Label-skew kinds only; the quantity-skew splits are deterministic.'),
  }),
  handler: async ({ experimentId, kind, alpha, numShardsPerPartition, numClassesPerPartition, seed }) => {
    const partitioner: Record<string, unknown> = { kind };
    if (alpha != null) partitioner.alpha = alpha;
    if (numShardsPerPartition != null) partitioner.num_shards_per_partition = numShardsPerPartition;
    if (numClassesPerPartition != null) partitioner.num_classes_per_partition = numClassesPerPartition;
    if (seed != null) partitioner.seed = seed;

    const config = await patchCustomConfig(experimentId, (c) => ({ ...c, partitioner }));
    return { partitioner: config.partitioner };
  },
});

export const setClientOverridesTool = defineTool({
  name: 'set_client_overrides',
  title: 'Set per-client hyperparameters',
  description:
    'Give individual clients different local training settings, keyed by partition ' +
    'id. Use this to model heterogeneous nodes -- a slow client running fewer ' +
    'epochs, or one with a different learning rate.',
  group: 'nodes',
  risk: 'write',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    overrides: z
      .record(
        z.string(),
        z.object({
          local_epochs: z.number().int().min(1).max(100).optional(),
          learning_rate: z.number().min(0.000001).max(10).optional(),
        })
      )
      .describe('Keyed by partition id, e.g. {"0": {"local_epochs": 3}}.'),
  }),
  handler: async ({ experimentId, overrides }) => {
    const config = await patchCustomConfig(experimentId, (c) => ({
      ...c,
      client_overrides: overrides,
    }));
    return { client_overrides: config.client_overrides };
  },
});

export const setClientCheckpointsTool = defineTool({
  name: 'set_client_checkpoints',
  title: 'Save per-client model checkpoints',
  description:
    'Persist every client\'s local model each round, not just the aggregated ' +
    'global one. Required before evaluate_checkpoint can assess a local model. ' +
    'Disk use multiplies by the number of participating clients, so leave it off ' +
    'unless you intend to analyse local models.',
  group: 'nodes',
  risk: 'write',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    enabled: z.boolean(),
  }),
  handler: async ({ experimentId, enabled }) => {
    const config = await patchCustomConfig(experimentId, (c) => ({
      ...c,
      save_client_checkpoints: enabled,
    }));
    return { save_client_checkpoints: config.save_client_checkpoints };
  },
});

export const configureAggregationTool = defineTool({
  name: 'configure_aggregation',
  title: 'Configure the aggregation strategy',
  description:
    'Choose how local models are merged into the global model, without uploading ' +
    'any code. FedProx adds a proximal term that helps under non-IID data; the ' +
    'FedAdam/FedAdagrad/FedYogi family applies a server-side optimiser. Call ' +
    'list_builtin_strategies for the available parameters.',
  group: 'strategy',
  risk: 'write',
  inputSchema: z.object({
    experimentId: experimentIdSchema,
    strategy: z.enum(['fedavg', 'fedprox', 'fedadam', 'fedadagrad', 'fedyogi']),
    params: z
      .record(z.string(), z.number())
      .optional()
      .describe('Strategy parameters, e.g. {"proximal_mu": 0.01} for fedprox.'),
  }),
  handler: async ({ experimentId, strategy, params }) => {
    const config = await patchCustomConfig(experimentId, (c) => ({
      ...c,
      strategy: params ? { name: strategy, params } : { name: strategy },
    }));
    return {
      strategy: config.strategy,
      note:
        'An uploaded algorithm module still takes precedence over this setting.',
    };
  },
});

export const mutationTools = [
  createExperimentTool,
  cloneExperimentTool,
  startExperimentTool,
  stopExperimentTool,
  deleteExperimentTool,
  updateExperimentConfigTool,
  setExperimentFilesTool,
  setPartitioningTool,
  setClientOverridesTool,
  setClientCheckpointsTool,
  configureAggregationTool,
];
