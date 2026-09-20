import { z } from 'zod';
import { defineTool } from '../registry';
import { wrapUntrusted } from '../untrusted';
import {
  DEFAULT_MAX_READ_BYTES,
  SCOPES,
  assertScope,
  listScoped,
  readScopedFile,
} from '../paths';
import { PYTORCH_TEMPLATES, USER_MODULE_CONTRACT, readPytorchTemplate } from '@/lib/templates';
import { USER_MODULE_NAMES, inspectCheckpoint, validateUserModule } from '@/lib/python-tools';
import { assertExperimentId, getCheckpoints } from '@/lib/experiments/service';
import { resolveScoped } from '../paths';
import { NotFoundError } from '@/lib/errors';

/** Groups E and D (reads) -- code, templates, and checkpoint inspection. */

const scopeSchema = z
  .enum(SCOPES as [string, ...string[]])
  .describe(
    "'uploads' = files uploaded for experiments; 'workspace' = files the agent " +
      "wrote; 'checkpoints' = saved models; 'runner-templates' = the starter templates."
  );

export const listFilesTool = defineTool({
  name: 'list_files',
  title: 'List files',
  description:
    'List files inside one of the testbed storage scopes. Paths are always ' +
    'relative to the scope root; nothing outside those roots is reachable.',
  group: 'files',
  risk: 'read',
  inputSchema: z.object({
    scope: scopeSchema,
    subpath: z.string().optional().describe('Directory within the scope. Defaults to the root.'),
    recursive: z.boolean().optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  }),
  handler: async ({ scope, subpath, recursive, limit }) => {
    const entries = await listScoped(assertScope(scope), subpath ?? '', { recursive, limit });
    return { scope, subpath: subpath ?? '', count: entries.length, entries };
  },
});

export const readFileTool = defineTool({
  name: 'read_file',
  title: 'Read a text file',
  description:
    'Read a text file from a storage scope. Returns the content wrapped as ' +
    'untrusted data, since uploaded code is written by users. Model checkpoints ' +
    'are binary and are rejected -- use inspect_checkpoint for those.',
  group: 'files',
  risk: 'read',
  inputSchema: z.object({
    scope: scopeSchema,
    path: z.string().describe('Path relative to the scope root.'),
    maxBytes: z
      .number()
      .int()
      .min(256)
      .max(DEFAULT_MAX_READ_BYTES)
      .optional()
      .describe(`Default ${DEFAULT_MAX_READ_BYTES}.`),
  }),
  handler: async ({ scope, path: relativePath, maxBytes }) => {
    const file = await readScopedFile(assertScope(scope), relativePath, maxBytes);
    return {
      scope: file.scope,
      path: file.path,
      sizeBytes: file.sizeBytes,
      truncated: file.truncated,
      content: wrapUntrusted(`${file.scope}:${file.path}`, file.content),
    };
  },
});

export const listTemplatesTool = defineTool({
  name: 'list_strategy_templates',
  title: 'List starter templates',
  description:
    'The PyTorch starter templates, and the exact contract each uploaded module ' +
    'must satisfy. Read this before writing a model, dataset, strategy or config ' +
    'file -- the runner validates these names statically and rejects anything else.',
  group: 'strategy',
  risk: 'read',
  inputSchema: z.object({}),
  handler: async () => ({
    templates: PYTORCH_TEMPLATES,
    contract: USER_MODULE_CONTRACT,
    note:
      'Templates can be read with read_file using scope "runner-templates", or ' +
      'via read_template.',
  }),
});

export const readTemplateTool = defineTool({
  name: 'read_template',
  title: 'Read a starter template',
  description:
    'The full source of one PyTorch starter template. Use it as the basis for a ' +
    'new model, dataset, strategy or config module.',
  group: 'strategy',
  risk: 'read',
  inputSchema: z.object({
    filename: z.enum(PYTORCH_TEMPLATES as unknown as [string, ...string[]]),
  }),
  handler: async ({ filename }) => ({
    filename,
    content: await readPytorchTemplate(filename),
  }),
});

export const validateUserModuleTool = defineTool({
  name: 'validate_user_module',
  title: 'Validate an experiment module',
  description:
    'Statically check that a Python file exports what the runner requires, without ' +
    'executing it. Always run this on generated code before attaching it to an ' +
    'experiment: a file that fails validation wastes a whole training run.',
  group: 'strategy',
  risk: 'read',
  inputSchema: z.object({
    scope: scopeSchema,
    path: z.string().describe('Path relative to the scope root.'),
    moduleType: z
      .enum(USER_MODULE_NAMES as unknown as [string, ...string[]])
      .describe(
        'user_model needs get_model() or a Net/Model class; user_dataset needs ' +
          'load_data(partition_id, num_partitions, batch_size=32); user_algorithm ' +
          'needs get_strategy(); user_config needs a CONFIG dict.'
      ),
  }),
  handler: async ({ scope, path: relativePath, moduleType }) => {
    const absolute = resolveScoped(assertScope(scope), relativePath);
    return validateUserModule(absolute, moduleType as (typeof USER_MODULE_NAMES)[number]);
  },
});

export const inspectCheckpointTool = defineTool({
  name: 'inspect_checkpoint',
  title: 'Inspect a model checkpoint',
  description:
    'Describe a saved checkpoint: the round it came from, the metrics stored with ' +
    'it, total parameter count, and every layer with its shape and mean absolute ' +
    'weight. Weights near zero across all layers usually mean training never moved them.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({
    experimentId: z.string().describe('Experiment UUID.'),
    round: z.number().int().min(1).describe('Which round to inspect.'),
  }),
  handler: async ({ experimentId, round }) => {
    const id = assertExperimentId(experimentId);
    const checkpoints = await getCheckpoints(id);
    const checkpoint = checkpoints.find((c) => c.round === round);

    if (!checkpoint) {
      throw new NotFoundError(
        `No checkpoint for round ${round}. Saved rounds: ${
          checkpoints.map((c) => c.round).join(', ') || 'none'
        }`
      );
    }

    // file_path is stored relative to the checkpoints root.
    const absolute = resolveScoped('checkpoints', checkpoint.filePath);
    const inspection = await inspectCheckpoint(absolute);

    return {
      experimentId: id,
      round,
      storedAccuracy: checkpoint.accuracy,
      storedLoss: checkpoint.loss,
      ...inspection,
    };
  },
});

export const fileTools = [
  listFilesTool,
  readFileTool,
  listTemplatesTool,
  readTemplateTool,
  validateUserModuleTool,
  inspectCheckpointTool,
];
