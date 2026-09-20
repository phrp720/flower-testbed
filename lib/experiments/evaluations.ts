import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { evaluateCheckpoint } from '@/lib/python-tools';
import { getCheckpoints, getExperiment, getMetrics } from './service';

/**
 * Standalone evaluations of saved checkpoints.
 *
 * Training only ever evaluates each client on its own partition, so it cannot
 * answer "how does this model do on somebody else's data?" -- which is exactly
 * the question client drift is about. These runs fill that gap, and are kept out
 * of the `metrics` table so the training curves stay a clean per-round series.
 */

export type EvaluationRun = typeof schema.evaluationRuns.$inferSelect;

export interface PerClientMetric {
  cid: string;
  phase: 'fit' | 'evaluate';
  num_examples: number | null;
  train_loss?: number;
  train_accuracy?: number;
  loss?: number;
  eval_accuracy?: number;
  /** The data partition this client held. Absent on runs recorded before it was reported. */
  partition_id?: number;
}

export async function listEvaluations(experimentId: string): Promise<EvaluationRun[]> {
  return db
    .select()
    .from(schema.evaluationRuns)
    .where(eq(schema.evaluationRuns.experimentId, experimentId))
    .orderBy(desc(schema.evaluationRuns.createdAt));
}

/** Client ids that have a saved local checkpoint for a round, in stable order. */
export async function listClientModels(experimentId: string, round: number): Promise<string[]> {
  const rows = await db
    .select({ clientId: schema.modelCheckpoints.clientId })
    .from(schema.modelCheckpoints)
    .where(
      and(
        eq(schema.modelCheckpoints.experimentId, experimentId),
        eq(schema.modelCheckpoints.round, round),
        isNotNull(schema.modelCheckpoints.clientId)
      )
    );

  return [...new Set(rows.map((r) => r.clientId!).filter(Boolean))].sort();
}

export interface DriftPlan {
  experimentId: string;
  round: number;
  /** null is the aggregated global model; the rest are client local models. */
  models: Array<string | null>;
  partitions: number[];
  /**
   * Which data partition each client actually held.
   *
   * Flower's client id is a random node identifier with no relation to the
   * partition index, so this cannot be inferred from ordering -- without it,
   * "a model on its own data" is not identifiable. Empty for runs recorded
   * before clients reported their partition.
   */
  clientPartitions: Record<string, number>;
  existing: Array<{
    clientId: string | null;
    partition: number;
    accuracy: number | null;
    loss: number | null;
  }>;
  note?: string;
}

/**
 * What a drift analysis for this round would consist of, plus whatever has
 * already been computed -- so the UI can render what exists and only run the
 * cells that are missing.
 */
export async function planDriftAnalysis(
  experimentId: string,
  round?: number
): Promise<DriftPlan> {
  const experiment = await getExperiment(experimentId);
  const checkpoints = await getCheckpoints(experimentId);

  const globalRounds = checkpoints
    .filter((c) => !c.clientId)
    .map((c) => c.round)
    .sort((a, b) => a - b);

  if (globalRounds.length === 0) {
    throw new ValidationError('This experiment has no saved checkpoints to evaluate.');
  }

  const targetRound = round ?? globalRounds[globalRounds.length - 1];
  const clientModels = await listClientModels(experimentId, targetRound);

  // Recover the cid -> partition mapping from the per-client metrics.
  const metrics = await getMetrics(experimentId);
  const clientPartitions: Record<string, number> = {};
  for (const row of metrics) {
    for (const entry of (row.clientMetrics ?? []) as PerClientMetric[]) {
      if (entry?.cid != null && typeof entry.partition_id === 'number') {
        clientPartitions[entry.cid] = entry.partition_id;
      }
    }
  }

  const evaluations = await listEvaluations(experimentId);
  const existing = evaluations
    .filter((row) => row.round === targetRound && row.split?.startsWith('partition_'))
    .map((row) => ({
      clientId: row.clientId,
      partition: Number.parseInt(row.split!.replace('partition_', ''), 10),
      accuracy: row.accuracy,
      loss: row.loss,
    }));

  // Order client rows by the partition they hold, so "model on its own data"
  // falls on the diagonal and the off-diagonal reads as drift at a glance.
  const orderedClients = [...clientModels].sort((a, b) => {
    const pa = clientPartitions[a];
    const pb = clientPartitions[b];
    if (pa == null && pb == null) return a.localeCompare(b);
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });

  return {
    experimentId,
    round: targetRound,
    models: [null, ...orderedClients],
    partitions: Array.from({ length: experiment.numClients }, (_, i) => i),
    clientPartitions,
    existing,
    ...(clientModels.length === 0
      ? {
          note:
            'Only the global model is available. Per-client models require ' +
            'save_client_checkpoints to have been enabled when the experiment ran.',
        }
      : {}),
  };
}

export interface RunEvaluationInput {
  experimentId: string;
  round: number;
  clientId?: string | null;
  partition: number;
}

export async function runEvaluation(input: RunEvaluationInput) {
  if (input.partition < 0) throw new ValidationError('partition must be zero or greater.');

  const result = await evaluateCheckpoint({
    experimentId: input.experimentId,
    round: input.round,
    clientId: input.clientId ?? null,
    partition: input.partition,
  });

  if (!result.ok) {
    throw new ValidationError(result.error ?? 'Evaluation failed.');
  }

  return {
    clientId: input.clientId ?? null,
    partition: input.partition,
    round: input.round,
    accuracy: result.accuracy ?? null,
    loss: result.loss ?? null,
    samples: result.samples ?? null,
  };
}
