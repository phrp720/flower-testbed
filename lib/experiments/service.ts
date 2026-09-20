import path from 'path';
import { unlink, rm } from 'fs/promises';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { CapacityError, NotFoundError, ValidationError } from '@/lib/errors';
import { getEffectiveRayCpuCount } from '@/lib/resources';
import { getExperimentCheckpointDir } from '@/lib/storage';
import { getProjectRoot } from '@/lib/paths';
import { parseExperimentIdParam } from '@/lib/experiment-id';
import {
  ensureExperimentRuntimeDirs,
  getExperimentCapacity,
  startExperimentExecution,
  stopExperimentExecution,
} from '@/lib/experiment-runtime';

/**
 * The single implementation of every experiment operation.
 *
 * HTTP route handlers and MCP tools both call into here. MCP tools must never
 * reach the testbed by calling its own HTTP API: an external MCP host has no
 * NextAuth cookie, and a server calling itself during a request is deadlock-prone
 * in development.
 */

export type Experiment = typeof schema.experiments.$inferSelect;
export type Metric = typeof schema.metrics.$inferSelect;
export type ModelCheckpoint = typeof schema.modelCheckpoints.$inferSelect;

export const EXPERIMENT_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/** Hyperparameters that may be patched while an experiment is still pending. */
export const PATCHABLE_FIELDS = [
  'name',
  'description',
  'numClients',
  'numRounds',
  'clientFraction',
  'localEpochs',
  'learningRate',
  'useGpu',
  'cpusPerClient',
  'gpuFractionPerClient',
  'customConfig',
  'algorithmPath',
  'modelPath',
  'configPath',
  'datasetPath',
] as const;

export type PatchableField = (typeof PATCHABLE_FIELDS)[number];
export type ExperimentPatch = Partial<Pick<typeof schema.experiments.$inferInsert, PatchableField>>;

export interface CreateExperimentInput {
  name?: string;
  description?: string | null;
  framework?: string;
  algorithmPath?: string | null;
  modelPath?: string | null;
  configPath?: string | null;
  datasetPath?: string | null;
  numClients?: number;
  numRounds?: number;
  clientFraction?: number;
  localEpochs?: number;
  learningRate?: number;
  useGpu?: boolean;
  cpusPerClient?: number;
  gpuFractionPerClient?: number;
  customConfig?: unknown;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Validates the raw route/tool parameter. Throws rather than returning null. */
export function assertExperimentId(id: string): string {
  const experimentId = parseExperimentIdParam(id);
  if (!experimentId) throw new ValidationError('Invalid experiment ID');
  return experimentId;
}

export async function listExperiments(options?: {
  status?: string;
  framework?: string;
  limit?: number;
  offset?: number;
}): Promise<Experiment[]> {
  const filters = [];
  if (options?.status) filters.push(eq(schema.experiments.status, options.status));
  if (options?.framework) filters.push(eq(schema.experiments.framework, options.framework));

  let query = db
    .select()
    .from(schema.experiments)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.experiments.createdAt))
    .$dynamic();

  if (options?.limit !== undefined) query = query.limit(options.limit);
  if (options?.offset !== undefined) query = query.offset(options.offset);

  return query;
}

export async function getExperiment(experimentId: string): Promise<Experiment> {
  const [experiment] = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, experimentId));

  if (!experiment) throw new NotFoundError('Experiment not found');
  return experiment;
}

export async function getMetrics(experimentId: string): Promise<Metric[]> {
  return db
    .select()
    .from(schema.metrics)
    .where(eq(schema.metrics.experimentId, experimentId))
    .orderBy(schema.metrics.round);
}

export async function getCheckpoints(experimentId: string): Promise<ModelCheckpoint[]> {
  return db
    .select()
    .from(schema.modelCheckpoints)
    .where(eq(schema.modelCheckpoints.experimentId, experimentId))
    .orderBy(schema.modelCheckpoints.round);
}

export interface ExperimentDetail {
  experiment: Experiment;
  metrics: Metric[];
  checkpoints: ModelCheckpoint[];
}

export async function getExperimentDetail(experimentId: string): Promise<ExperimentDetail> {
  const experiment = await getExperiment(experimentId);
  const [metrics, checkpoints] = await Promise.all([
    getMetrics(experimentId),
    getCheckpoints(experimentId),
  ]);
  return { experiment, metrics, checkpoints };
}

/**
 * Stopping writes status='failed' with errorMessage='Stopped by user' -- there is
 * no 'stopped' status in the system. Consumers that reason about *why* a run
 * ended (the agent, above all) need that distinction, so derive it here rather
 * than teaching every caller the convention.
 *
 * This is intentionally not applied to the HTTP responses: the UI keys off the
 * raw `status` string and changing it would be a breaking API change.
 */
export function describeExperimentOutcome(experiment: Experiment): {
  status: string;
  stoppedByUser: boolean;
  outcome: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
} {
  const stoppedByUser =
    experiment.status === 'failed' && experiment.errorMessage === 'Stopped by user';

  return {
    status: experiment.status,
    stoppedByUser,
    outcome: stoppedByUser ? 'stopped' : (experiment.status as ExperimentStatus),
  };
}

/**
 * The live snapshot the SSE endpoint emits each tick. Kept here so the agent's
 * status tools report exactly what the experiment page shows.
 */
export interface ExperimentSnapshot {
  experiment: {
    id: string;
    name: string;
    status: string;
    currentRound: number;
    totalRounds: number;
  };
  metrics: Array<{
    id: string;
    round: number;
    trainLoss: number | null;
    trainAccuracy: number | null;
    evalLoss: number | null;
    evalAccuracy: number | null;
    createdAt: Date;
  }>;
  checkpoints: Array<{
    id: string;
    round: number;
    filePath: string;
    accuracy: number | null;
    loss: number | null;
    createdAt: Date;
  }>;
  latestMetrics: {
    round: number;
    trainLoss: number | null;
    trainAccuracy: number | null;
    evalLoss: number | null;
    evalAccuracy: number | null;
  } | null;
}

/** Returns null when the experiment has disappeared, which tells the stream to close. */
export async function buildExperimentSnapshot(
  experimentId: string
): Promise<ExperimentSnapshot | null> {
  const [experiment] = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, experimentId));

  if (!experiment) return null;

  const [metrics, checkpoints] = await Promise.all([
    getMetrics(experimentId),
    getCheckpoints(experimentId),
  ]);

  const latestMetrics = metrics[metrics.length - 1] || null;

  return {
    experiment: {
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      currentRound: latestMetrics?.round || 0,
      totalRounds: experiment.numRounds,
    },
    metrics: metrics.map((m) => ({
      id: m.id,
      round: m.round,
      trainLoss: m.trainLoss,
      trainAccuracy: m.trainAccuracy,
      evalLoss: m.evalLoss,
      evalAccuracy: m.evalAccuracy,
      createdAt: m.createdAt,
    })),
    checkpoints: checkpoints.map((c) => ({
      id: c.id,
      round: c.round,
      filePath: c.filePath,
      accuracy: c.accuracy,
      loss: c.loss,
      createdAt: c.createdAt,
    })),
    latestMetrics: latestMetrics
      ? {
          round: latestMetrics.round,
          trainLoss: latestMetrics.trainLoss,
          trainAccuracy: latestMetrics.trainAccuracy,
          evalLoss: latestMetrics.evalLoss,
          evalAccuracy: latestMetrics.evalAccuracy,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function assertCpuBudget(cpusPerClient: number): void {
  const effectiveRayCpus = getEffectiveRayCpuCount();
  if (cpusPerClient > effectiveRayCpus) {
    throw new ValidationError(
      `CPUs per client (${cpusPerClient}) cannot exceed the available Ray CPU budget (${effectiveRayCpus}).`
    );
  }
}

async function assertCapacity(excludeExperimentId?: string): Promise<void> {
  const capacity = await getExperimentCapacity(
    excludeExperimentId ? { excludeExperimentId } : undefined
  );
  if (!capacity.canCreateExperiment) {
    throw new CapacityError(
      `All experiment worker slots are busy (${capacity.activeExperiments}/${capacity.maxConcurrentExperiments}). Try again when a slot is free.`
    );
  }
}

export async function createExperiment(input: CreateExperimentInput): Promise<Experiment> {
  const {
    name,
    description,
    framework,
    algorithmPath,
    modelPath,
    configPath,
    datasetPath,
    numClients = 10,
    numRounds = 3,
    clientFraction = 0.5,
    localEpochs = 1,
    learningRate = 0.01,
    useGpu = false,
    cpusPerClient = 1,
    gpuFractionPerClient = 0.1,
    customConfig,
  } = input;

  if (!name || !framework) {
    throw new ValidationError('Name and framework are required');
  }

  assertCpuBudget(cpusPerClient);
  await assertCapacity();

  const [experiment] = await db
    .insert(schema.experiments)
    .values({
      name,
      description,
      framework,
      algorithmPath,
      modelPath,
      configPath,
      datasetPath,
      numClients,
      numRounds,
      clientFraction,
      localEpochs,
      learningRate,
      useGpu,
      cpusPerClient,
      gpuFractionPerClient,
      customConfig,
      status: 'pending',
    })
    .returning();

  return experiment;
}

/**
 * Patch hyperparameters. Rejected once the experiment has left `pending`,
 * because the runner reads its whole configuration once at startup -- a later
 * write would be accepted silently and never take effect.
 */
export async function updateExperiment(
  experimentId: string,
  patch: ExperimentPatch
): Promise<Experiment> {
  const experiment = await getExperiment(experimentId);

  if (experiment.status !== 'pending') {
    throw new ValidationError(
      `Experiment configuration can only be changed while it is pending (current status: ${experiment.status}).`
    );
  }

  const updates: ExperimentPatch = {};
  for (const field of PATCHABLE_FIELDS) {
    if (patch[field] !== undefined) {
      (updates as Record<string, unknown>)[field] = patch[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError(
      `No updatable fields supplied. Allowed: ${PATCHABLE_FIELDS.join(', ')}`
    );
  }

  if (updates.cpusPerClient !== undefined) {
    assertCpuBudget(updates.cpusPerClient);
  }

  const [updated] = await db
    .update(schema.experiments)
    .set(updates)
    .where(eq(schema.experiments.id, experimentId))
    .returning();

  return updated;
}

/** Copy an experiment's files and hyperparameters into a fresh pending run. */
export async function cloneExperiment(
  experimentId: string,
  options: { name?: string; overrides?: ExperimentPatch } = {}
): Promise<Experiment> {
  const source = await getExperiment(experimentId);
  const overrides = options.overrides ?? {};

  return createExperiment({
    name: options.name ?? `${source.name} (copy)`,
    description: source.description,
    framework: source.framework,
    algorithmPath: source.algorithmPath,
    modelPath: source.modelPath,
    configPath: source.configPath,
    datasetPath: source.datasetPath,
    numClients: source.numClients,
    numRounds: source.numRounds,
    clientFraction: source.clientFraction,
    localEpochs: source.localEpochs,
    learningRate: source.learningRate,
    useGpu: source.useGpu,
    cpusPerClient: source.cpusPerClient,
    gpuFractionPerClient: source.gpuFractionPerClient,
    customConfig: source.customConfig,
    ...overrides,
  });
}

export async function startExperiment(experimentId: string): Promise<void> {
  const experiment = await getExperiment(experimentId);

  if (experiment.status === 'running') {
    // Deliberately a 400, matching the behaviour this replaced.
    throw new ValidationError('Experiment is already running');
  }

  await assertCapacity(experimentId);

  await db
    .update(schema.experiments)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(schema.experiments.id, experimentId));

  await ensureExperimentRuntimeDirs(experimentId);

  try {
    await startExperimentExecution(experimentId);
  } catch (startupError) {
    await db
      .update(schema.experiments)
      .set({
        status: 'failed',
        errorMessage:
          startupError instanceof Error ? startupError.message : 'Flower runner failed to start',
        completedAt: new Date(),
      })
      .where(eq(schema.experiments.id, experimentId));
    throw startupError;
  }
}

export async function stopExperiment(
  experimentId: string
): Promise<{ stopped: boolean; message: string }> {
  const experiment = await getExperiment(experimentId);

  if (experiment.status !== 'running' && experiment.status !== 'pending') {
    return { stopped: false, message: 'Experiment is not running' };
  }

  await stopExperimentExecution(experimentId);

  await db
    .update(schema.experiments)
    .set({ status: 'failed', errorMessage: 'Stopped by user', completedAt: new Date() })
    .where(eq(schema.experiments.id, experimentId));

  return { stopped: true, message: 'Experiment stopped' };
}

async function safeDeleteFile(filePath: string): Promise<void> {
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(getProjectRoot(), filePath);
    await unlink(fullPath);
  } catch {
    console.log(`Could not delete file: ${filePath}`);
  }
}

async function safeDeleteDir(dirPath: string): Promise<void> {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch {
    console.log(`Could not delete directory: ${dirPath}`);
  }
}

/**
 * Uploaded files are referenced by path, and cloneExperiment copies those paths
 * verbatim, so a file can be shared by several experiments. Only unlink the ones
 * no surviving experiment still points at.
 */
async function deleteUnreferencedFiles(experiment: Experiment): Promise<void> {
  const candidates = [
    experiment.algorithmPath,
    experiment.modelPath,
    experiment.configPath,
    experiment.datasetPath,
  ].filter((p): p is string => Boolean(p));

  if (candidates.length === 0) return;

  const others = await db
    .select({
      algorithmPath: schema.experiments.algorithmPath,
      modelPath: schema.experiments.modelPath,
      configPath: schema.experiments.configPath,
      datasetPath: schema.experiments.datasetPath,
    })
    .from(schema.experiments)
    .where(ne(schema.experiments.id, experiment.id));

  const stillReferenced = new Set<string>();
  for (const row of others) {
    for (const value of [row.algorithmPath, row.modelPath, row.configPath, row.datasetPath]) {
      if (value) stillReferenced.add(value);
    }
  }

  for (const filePath of new Set(candidates)) {
    if (stillReferenced.has(filePath)) continue;
    await safeDeleteFile(filePath);
  }
}

export async function deleteExperiment(experimentId: string): Promise<void> {
  const experiment = await getExperiment(experimentId);

  if (experiment.status === 'running' || experiment.status === 'pending') {
    await stopExperimentExecution(experimentId);
  }

  await deleteUnreferencedFiles(experiment);
  await safeDeleteDir(getExperimentCheckpointDir(experimentId));

  // Cascades to metrics, checkpoints and clients.
  await db.delete(schema.experiments).where(eq(schema.experiments.id, experimentId));
}

/** Fetch several experiments at once, for comparison tools. */
export async function getExperimentsByIds(ids: string[]): Promise<Experiment[]> {
  if (ids.length === 0) return [];
  return db.select().from(schema.experiments).where(inArray(schema.experiments.id, ids));
}
