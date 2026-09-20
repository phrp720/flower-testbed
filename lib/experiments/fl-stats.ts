import { getCheckpoints, getExperiment, getMetrics } from './service';
import { getCheckpointsDir } from '@/lib/storage';
import { resolveSafe } from '@/lib/storage';
import { inspectCheckpoint } from '@/lib/python-tools';
import type { PerClientMetric } from './evaluations';

/**
 * The federated-learning series behind the round-by-round charts.
 *
 * Every number here comes from what the run recorded. Where a quantity could
 * not be measured it is reported as absent rather than approximated, because a
 * plausible-looking wrong number is worse than a gap.
 */

export type CommunicationSource =
  /** Byte counts the strategy recorded as Flower serialised them. */
  | 'measured'
  /** Model size read back from the saved checkpoint's tensors. */
  | 'derived'
  /** Neither available -- the run predates byte accounting and kept no checkpoint. */
  | 'unavailable';

export interface FlStats {
  rounds: number[];
  numClients: number;
  /** The configured sampling fraction, for comparison with what actually happened. */
  clientFraction: number;
  /** One model's parameters in bytes. Null when it could not be established. */
  modelBytes: number | null;
  communicationSource: CommunicationSource;
  /**
   * Clients that trained and clients that evaluated, counted separately: Flower
   * samples the two cohorts independently, so merging them overstates both.
   */
  participation: Array<{
    round: number;
    fit: number;
    evaluate: number;
    fraction: number;
  }>;
  /** Model parameters moved, counting every download and upload. */
  communication: Array<{ round: number; roundBytes: number; cumulativeBytes: number }>;
  clientLoss: Array<{ round: number } & Record<string, number | null>>;
  /** Stable client keys for the loss series, in partition order where known. */
  clientKeys: string[];
  convergence: Array<{ round: number; accuracy: number | null; improvement: number | null }>;
  best: { key: string; loss: number } | null;
  worst: { key: string; loss: number } | null;
}

interface TransferRow extends PerClientMetric {
  downlink_bytes?: number | null;
  uplink_bytes?: number | null;
}

function clientKey(entry: PerClientMetric): string {
  return entry.partition_id != null ? `p${entry.partition_id}` : entry.cid.slice(0, 6);
}

/**
 * A model's parameter size, read out of a saved checkpoint.
 *
 * Only needed for runs recorded before the strategy counted bytes itself. The
 * shape of a model never changes across a run, so this is asked once and kept;
 * loading a state dict costs a Python start-up and a torch import.
 */
const modelBytesCache = new Map<string, number | null>();

async function deriveModelBytes(
  experimentId: string,
  relativePath: string
): Promise<number | null> {
  const cached = modelBytesCache.get(experimentId);
  if (cached !== undefined) return cached;

  const absolute = resolveSafe(getCheckpointsDir(), relativePath);
  if (!absolute) {
    modelBytesCache.set(experimentId, null);
    return null;
  }

  const bytes = await inspectCheckpoint(absolute)
    .then((result) => (result.ok ? result.parameterBytes ?? null : null))
    .catch(() => null);

  modelBytesCache.set(experimentId, bytes);
  return bytes;
}

export async function buildFlStats(experimentId: string): Promise<FlStats> {
  const [experiment, metrics, checkpoints] = await Promise.all([
    getExperiment(experimentId),
    getMetrics(experimentId),
    getCheckpoints(experimentId),
  ]);

  const rounds = metrics.map((m) => m.round);
  const participation: FlStats['participation'] = [];
  const communication: FlStats['communication'] = [];
  const clientLoss: FlStats['clientLoss'] = [];
  const convergence: FlStats['convergence'] = [];

  const keys = new Set<string>();
  const lossTotals = new Map<string, { sum: number; count: number }>();

  // Rows carry their own byte counts from any run that recorded them. Falling
  // back to the checkpoint is only for older runs, so do not pay for it unless
  // the rows turn out to be silent.
  const allRows = metrics.map(
    (metric) => ((metric.clientMetrics ?? []) as TransferRow[]).filter(Boolean)
  );
  const measured = allRows.some((rows) =>
    rows.some((row) => typeof row.downlink_bytes === 'number')
  );

  let modelBytes: number | null = null;
  let communicationSource: CommunicationSource = 'unavailable';

  if (measured) {
    communicationSource = 'measured';
    // One client's download is one model, which is the natural unit to quote.
    for (const rows of allRows) {
      const sample = rows.find((row) => typeof row.downlink_bytes === 'number');
      if (sample) {
        modelBytes = sample.downlink_bytes as number;
        break;
      }
    }
  } else {
    const globalCheckpoint = checkpoints.find((c) => !c.clientId);
    if (globalCheckpoint) {
      modelBytes = await deriveModelBytes(experimentId, globalCheckpoint.filePath);
      if (modelBytes != null) communicationSource = 'derived';
    }
  }

  let cumulativeBytes = 0;
  let previousAccuracy: number | null = null;

  for (const [index, metric] of metrics.entries()) {
    const rows = allRows[index] ?? [];

    const fitRows = rows.filter((row) => row.phase === 'fit');
    const evaluateRows = rows.filter((row) => row.phase === 'evaluate');

    const fit = new Set(fitRows.map((r) => r.cid).filter(Boolean)).size;
    const evaluate = new Set(evaluateRows.map((r) => r.cid).filter(Boolean)).size;

    participation.push({
      round: metric.round,
      fit,
      evaluate,
      // Training participation is what the sampling fraction governs and what
      // determines whose data reached the global model this round.
      fraction: experiment.numClients > 0 ? fit / experiment.numClients : 0,
    });

    let roundBytes = 0;
    if (communicationSource === 'measured') {
      for (const row of rows) {
        roundBytes += (row.downlink_bytes ?? 0) + (row.uplink_bytes ?? 0);
      }
    } else if (modelBytes != null) {
      // Each training client downloads the global model and uploads its own;
      // each evaluating client only downloads.
      roundBytes = modelBytes * (fit * 2 + evaluate);
    }
    cumulativeBytes += roundBytes;
    communication.push({ round: metric.round, roundBytes, cumulativeBytes });

    const lossRow: { round: number } & Record<string, number | null> = { round: metric.round };
    for (const entry of evaluateRows) {
      const key = clientKey(entry);
      keys.add(key);

      const loss = entry.loss ?? null;
      lossRow[key] = loss;

      if (loss != null) {
        const totals = lossTotals.get(key) ?? { sum: 0, count: 0 };
        totals.sum += loss;
        totals.count += 1;
        lossTotals.set(key, totals);
      }
    }
    clientLoss.push(lossRow);

    const accuracy = metric.evalAccuracy;
    convergence.push({
      round: metric.round,
      accuracy,
      improvement:
        accuracy != null && previousAccuracy != null ? accuracy - previousAccuracy : null,
    });
    if (accuracy != null) previousAccuracy = accuracy;
  }

  // Ranked on mean loss across the run, so a single bad round does not decide it.
  const averages = [...lossTotals.entries()]
    .map(([key, { sum, count }]) => ({ key, loss: sum / count }))
    .sort((a, b) => a.loss - b.loss);

  return {
    rounds,
    numClients: experiment.numClients,
    clientFraction: experiment.clientFraction,
    modelBytes,
    communicationSource,
    participation,
    communication,
    clientLoss,
    clientKeys: [...keys].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    ),
    convergence,
    best: averages[0] ?? null,
    worst: averages[averages.length - 1] ?? null,
  };
}
