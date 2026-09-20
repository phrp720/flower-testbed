import path from 'path';
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { defineTool } from '../registry';
import { assertScope, assertWritableScope, resolveScoped } from '../paths';
import { buildUnifiedDiff } from '@/lib/agent/preview';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { db, schema } from '@/lib/db';
import { getAgentWorkspaceDir } from '@/lib/storage';
import { persistUpload } from '@/lib/uploads';
import { UPLOAD_TYPES, type UploadType } from '@/lib/storage';
import {
  USER_MODULE_NAMES,
  dryRunStrategy,
  evaluateCheckpoint,
  listBuiltinStrategies,
  validateUserModule,
} from '@/lib/python-tools';
import { assertExperimentId, getCheckpoints, getMetrics } from '@/lib/experiments/service';

/**
 * Writing code, and the evaluation tools that judge it.
 *
 * Writes are confined to the agent workspace. That confinement is the hard
 * boundary in the system: it is enforced by path resolution, not by asking the
 * model nicely, so no instruction found in a log or an uploaded file can widen it.
 */

/** Text-only, and capped: a runaway generation should fail rather than fill the disk. */
const MAX_WRITE_BYTES = 512 * 1024;

const ALLOWED_WRITE_EXTENSIONS = new Set(['.py', '.json', '.yaml', '.yml', '.txt', '.md', '.csv']);

function assertWritablePath(relativePath: string): void {
  const ext = path.extname(relativePath).toLowerCase();
  if (!ALLOWED_WRITE_EXTENSIONS.has(ext)) {
    throw new ValidationError(
      `Cannot write '${relativePath}'. Allowed extensions: ${[...ALLOWED_WRITE_EXTENSIONS].join(', ')}`
    );
  }
}

async function readIfExists(absolute: string): Promise<string | null> {
  try {
    return await readFile(absolute, 'utf-8');
  } catch {
    return null;
  }
}

/** Raw bytes, for files that are not text and must survive a copy intact. */
async function readBytesIfExists(absolute: string): Promise<Buffer | null> {
  try {
    return await readFile(absolute);
  } catch {
    return null;
  }
}

async function recordArtifact(input: {
  relativePath: string;
  contents: string;
  kind: string;
  experimentId?: string | null;
}): Promise<void> {
  const filename = path.basename(input.relativePath);

  // Version by counting what came before, so a rewrite is traceable.
  const [previous] = await db
    .select()
    .from(schema.agentArtifacts)
    .where(eq(schema.agentArtifacts.relativePath, input.relativePath))
    .orderBy(desc(schema.agentArtifacts.version))
    .limit(1);

  await db.insert(schema.agentArtifacts).values({
    kind: input.kind,
    filename,
    relativePath: input.relativePath,
    language: path.extname(filename) === '.py' ? 'python' : null,
    contentHash: createHash('sha256').update(input.contents).digest('hex'),
    sizeBytes: Buffer.byteLength(input.contents, 'utf-8'),
    version: (previous?.version ?? 0) + 1,
    supersedesId: previous?.id ?? null,
    experimentId: input.experimentId ?? null,
  });
}

export const writeFileTool = defineTool({
  name: 'write_file',
  title: 'Write a file',
  description:
    'Write a text file into the agent workspace, creating or replacing it. This ' +
    'is the only writable location. After writing a Python module, run ' +
    'validate_user_module on it before attaching it to an experiment.',
  group: 'files',
  risk: 'write',
  eagerInput: true,
  inputSchema: z.object({
    path: z.string().describe('Path relative to the workspace root, e.g. "strategies/fedprox.py".'),
    contents: z.string().describe('Full file contents.'),
    kind: z
      .enum(['algorithm', 'model', 'dataset', 'config', 'note', 'report', 'patch'])
      .default('note'),
    experimentId: z.string().nullable().optional(),
  }),
  handler: async ({ path: relativePath, contents, kind, experimentId }) => {
    assertWritablePath(relativePath);

    if (Buffer.byteLength(contents, 'utf-8') > MAX_WRITE_BYTES) {
      throw new ValidationError(`File exceeds the ${MAX_WRITE_BYTES} byte limit.`);
    }

    const absolute = resolveScoped('workspace', relativePath);
    const previous = await readIfExists(absolute);

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, 'utf-8');

    await recordArtifact({ relativePath, contents, kind, experimentId });

    return {
      scope: 'workspace',
      path: relativePath,
      bytes: Buffer.byteLength(contents, 'utf-8'),
      replaced: previous !== null,
      diff: buildUnifiedDiff(relativePath, previous, contents),
    };
  },
});

export const editFileTool = defineTool({
  name: 'edit_file',
  title: 'Edit a file',
  description:
    'Replace an exact string in a workspace file. The old string must appear ' +
    'exactly once, so an ambiguous edit fails rather than changing the wrong line.',
  group: 'files',
  risk: 'write',
  eagerInput: true,
  inputSchema: z.object({
    path: z.string().describe('Path relative to the workspace root.'),
    oldString: z.string().min(1),
    newString: z.string(),
  }),
  handler: async ({ path: relativePath, oldString, newString }) => {
    const absolute = resolveScoped('workspace', relativePath);
    const current = await readIfExists(absolute);

    if (current === null) throw new NotFoundError(`No such file in the workspace: ${relativePath}`);

    const occurrences = current.split(oldString).length - 1;
    if (occurrences === 0) {
      throw new ValidationError('The text to replace was not found in the file.');
    }
    if (occurrences > 1) {
      throw new ValidationError(
        `The text to replace appears ${occurrences} times. Include more surrounding ` +
          'context so the match is unique.'
      );
    }

    const updated = current.replace(oldString, newString);
    await writeFile(absolute, updated, 'utf-8');
    await recordArtifact({ relativePath, contents: updated, kind: 'patch' });

    return {
      path: relativePath,
      bytes: Buffer.byteLength(updated, 'utf-8'),
      diff: buildUnifiedDiff(relativePath, current, updated),
    };
  },
});

export const promoteArtifactTool = defineTool({
  name: 'upload_from_agent',
  title: 'Attach a workspace file to the uploads',
  description:
    'Promote a workspace file into the canonical uploads tree, exactly as a human ' +
    'upload would land. Returns the stored path to pass to set_experiment_files.',
  group: 'files',
  risk: 'write',
  inputSchema: z.object({
    workspacePath: z.string().describe('Path relative to the workspace root.'),
    type: z.enum(UPLOAD_TYPES as [UploadType, ...UploadType[]]),
  }),
  handler: async ({ workspacePath, type }) => {
    const absolute = resolveScoped('workspace', workspacePath);
    // Copied as bytes, not decoded and re-encoded as UTF-8. A model file is a
    // legitimate thing to promote -- the model upload type accepts .pt, .pth
    // and .pkl -- and a text round-trip would silently corrupt every one of
    // them while still reporting success.
    const contents = await readBytesIfExists(absolute);
    if (contents === null) throw new NotFoundError(`No such file: ${workspacePath}`);

    const result = await persistUpload(contents, path.basename(workspacePath), type);

    return { ...result, note: 'Pass this path to set_experiment_files.' };
  },
});

export const listStrategiesTool = defineTool({
  name: 'list_builtin_strategies',
  title: 'List built-in aggregation strategies',
  description:
    'The aggregation strategies available without writing code, with their ' +
    'tunable parameters and defaults. Use with configure_aggregation.',
  group: 'strategy',
  risk: 'read',
  inputSchema: z.object({}),
  handler: async () => listBuiltinStrategies(),
});

export const dryRunStrategyTool = defineTool({
  name: 'dry_run_strategy',
  title: 'Dry-run a strategy module',
  description:
    'Import a strategy module in a separate process and report which class it ' +
    'builds and which aggregation callbacks it defines, without training. Catches ' +
    'the expensive failure: a strategy that trains fine but records no eval metrics.',
  group: 'strategy',
  risk: 'execute',
  inputSchema: z.object({
    scope: z.enum(['workspace', 'uploads', 'runner-templates']),
    path: z.string().describe('Path relative to the scope root.'),
  }),
  handler: async ({ scope, path: relativePath }) =>
    dryRunStrategy(resolveScoped(assertScope(scope), relativePath)),
});

export const evaluateCheckpointTool = defineTool({
  name: 'evaluate_checkpoint',
  title: 'Evaluate a saved model',
  description:
    'Run a saved checkpoint over a data partition and report loss and accuracy. ' +
    'This answers questions training never does -- how the global model performs ' +
    'on one client\'s data, or how a client\'s local model performs on another\'s. ' +
    'Evaluating a local model requires the run to have had save_client_checkpoints ' +
    'enabled. Takes minutes, since it is a full forward pass.',
  group: 'results',
  risk: 'execute',
  inputSchema: z.object({
    experimentId: z.string().describe('Experiment UUID.'),
    round: z.number().int().min(1),
    clientId: z
      .string()
      .nullable()
      .optional()
      .describe("Evaluate this client's local model. Omit for the global model."),
    partition: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Evaluate on this client's data partition. Defaults to 0."),
  }),
  handler: async ({ experimentId, round, clientId, partition }) =>
    evaluateCheckpoint({
      experimentId: assertExperimentId(experimentId),
      round,
      clientId,
      partition,
    }),
});

export const getClientMetricsTool = defineTool({
  name: 'get_client_metrics',
  title: 'Get per-client metrics',
  description:
    'Per-client training and evaluation metrics for each round, including how many ' +
    'samples each client held. Under non-IID partitioning this is where client ' +
    'drift and stragglers become visible -- the aggregate hides both.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({
    experimentId: z.string().describe('Experiment UUID.'),
    round: z.number().int().min(1).optional().describe('One round, or omit for all.'),
  }),
  handler: async ({ experimentId, round }) => {
    const metrics = await getMetrics(assertExperimentId(experimentId));
    const rows = metrics
      .filter((m) => round == null || m.round === round)
      .map((m) => ({ round: m.round, clients: (m.clientMetrics ?? []) as unknown[] }));

    const total = rows.reduce((sum, r) => sum + r.clients.length, 0);

    return {
      rounds: rows.length,
      totalEntries: total,
      ...(total === 0
        ? {
            note:
              'No per-client metrics recorded. Runs from before this was captured ' +
              'have none; re-run the experiment to collect them.',
          }
        : {}),
      metrics: rows,
    };
  },
});

export const listEvaluationsTool = defineTool({
  name: 'list_evaluations',
  title: 'List standalone evaluations',
  description:
    'Evaluations run with evaluate_checkpoint, kept separate from the per-round ' +
    'training series so the training charts stay accurate.',
  group: 'results',
  risk: 'read',
  inputSchema: z.object({ experimentId: z.string().describe('Experiment UUID.') }),
  handler: async ({ experimentId }) => {
    const rows = await db
      .select()
      .from(schema.evaluationRuns)
      .where(eq(schema.evaluationRuns.experimentId, assertExperimentId(experimentId)))
      .orderBy(desc(schema.evaluationRuns.createdAt));

    return {
      count: rows.length,
      evaluations: rows.map((row) => ({
        round: row.round,
        clientId: row.clientId,
        target: row.clientId ? 'local model' : 'global model',
        split: row.split,
        accuracy: row.accuracy,
        loss: row.loss,
        createdAt: row.createdAt,
      })),
    };
  },
});

export const workspaceTools = [
  writeFileTool,
  editFileTool,
  promoteArtifactTool,
  listStrategiesTool,
  dryRunStrategyTool,
  evaluateCheckpointTool,
  getClientMetricsTool,
  listEvaluationsTool,
];
