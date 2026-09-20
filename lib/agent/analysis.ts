import type { Experiment, Metric, ModelCheckpoint } from '@/lib/experiments/service';
import { describeExperimentOutcome } from '@/lib/experiments/service';

/**
 * Deterministic analysis of experiment results.
 *
 * This is plain arithmetic, not a model call. Handing the agent a computed
 * digest keeps raw metric tables and 200 KB log blobs out of the context window,
 * and means the numbers it reasons about are never ones it derived itself.
 */

export interface MetricSeriesSummary {
  rounds: number;
  bestRound: number | null;
  bestEvalAccuracy: number | null;
  finalEvalAccuracy: number | null;
  finalEvalLoss: number | null;
  finalTrainAccuracy: number | null;
  finalTrainLoss: number | null;
  /** Mean change in eval accuracy per round; negative means it is getting worse. */
  accuracyTrendPerRound: number | null;
  /** Rounds since the best result, i.e. how long it has been flat. */
  roundsSinceBest: number | null;
  plateaued: boolean;
  diverged: boolean;
}

function lastNonNull(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] != null) return values[i];
  }
  return null;
}

export function summariseMetrics(metrics: Metric[]): MetricSeriesSummary {
  const empty: MetricSeriesSummary = {
    rounds: 0,
    bestRound: null,
    bestEvalAccuracy: null,
    finalEvalAccuracy: null,
    finalEvalLoss: null,
    finalTrainAccuracy: null,
    finalTrainLoss: null,
    accuracyTrendPerRound: null,
    roundsSinceBest: null,
    plateaued: false,
    diverged: false,
  };

  if (metrics.length === 0) return empty;

  const sorted = [...metrics].sort((a, b) => a.round - b.round);
  const accuracies = sorted.map((m) => m.evalAccuracy);

  let bestRound: number | null = null;
  let bestEvalAccuracy: number | null = null;
  for (const metric of sorted) {
    if (metric.evalAccuracy == null) continue;
    if (bestEvalAccuracy == null || metric.evalAccuracy > bestEvalAccuracy) {
      bestEvalAccuracy = metric.evalAccuracy;
      bestRound = metric.round;
    }
  }

  const known = sorted.filter((m) => m.evalAccuracy != null);
  const accuracyTrendPerRound =
    known.length >= 2
      ? (known[known.length - 1].evalAccuracy! - known[0].evalAccuracy!) /
        (known[known.length - 1].round - known[0].round || 1)
      : null;

  const lastRound = sorted[sorted.length - 1].round;
  const roundsSinceBest = bestRound != null ? lastRound - bestRound : null;

  // A run is only "plateaued" once there is enough history for that to mean
  // something; three rounds of no improvement is the threshold.
  const plateaued = roundsSinceBest != null && known.length >= 4 && roundsSinceBest >= 3;

  const finalEvalLoss = lastNonNull(sorted.map((m) => m.evalLoss));
  const firstLoss = sorted.find((m) => m.evalLoss != null)?.evalLoss ?? null;
  const diverged =
    (finalEvalLoss != null && !Number.isFinite(finalEvalLoss)) ||
    (finalEvalLoss != null && firstLoss != null && finalEvalLoss > firstLoss * 2);

  return {
    rounds: sorted.length,
    bestRound,
    bestEvalAccuracy,
    finalEvalAccuracy: lastNonNull(accuracies),
    finalEvalLoss,
    finalTrainAccuracy: lastNonNull(sorted.map((m) => m.trainAccuracy)),
    finalTrainLoss: lastNonNull(sorted.map((m) => m.trainLoss)),
    accuracyTrendPerRound,
    roundsSinceBest,
    plateaued,
    diverged,
  };
}

export interface ExperimentDigest {
  id: string;
  name: string;
  framework: string;
  status: string;
  outcome: string;
  stoppedByUser: boolean;
  config: Record<string, unknown>;
  uploadedFiles: Record<string, string | null>;
  metrics: MetricSeriesSummary;
  checkpointCount: number;
  latestCheckpointRound: number | null;
  errorMessage: string | null;
  /** Plain-language notes, including the instrumentation traps worth flagging. */
  notes: string[];
  durationSeconds: number | null;
}

export function digestExperiment(
  experiment: Experiment,
  metrics: Metric[],
  checkpoints: ModelCheckpoint[]
): ExperimentDigest {
  const summary = summariseMetrics(metrics);
  const outcome = describeExperimentOutcome(experiment);
  const notes: string[] = [];

  if (outcome.stoppedByUser) {
    notes.push(
      'This run was stopped by the user. The platform records that as status="failed" ' +
        'with errorMessage="Stopped by user"; it is not a training failure.'
    );
  }

  // The single most misleading state the analyst can encounter.
  if (metrics.length > 0 && summary.finalEvalAccuracy == null) {
    notes.push(
      'No eval_accuracy was recorded on any round. This almost always means the ' +
        'strategy did not report evaluation metrics, not that the model failed to ' +
        'learn -- a user-supplied get_strategy() that omits ' +
        'evaluate_metrics_aggregation_fn produces exactly this. Do not draw ' +
        'conclusions about model quality from it.'
    );
  }

  if (experiment.status === 'completed' && metrics.length === 0) {
    notes.push('The run completed but recorded no metrics at all. Check the logs.');
  }

  if (summary.plateaued) {
    notes.push(
      `Eval accuracy has not improved since round ${summary.bestRound} (${summary.roundsSinceBest} rounds).`
    );
  }

  if (summary.diverged) {
    notes.push('Eval loss has grown substantially since the first round; this run looks divergent.');
  }

  if (experiment.algorithmPath == null) {
    notes.push('No custom algorithm was uploaded, so aggregation used the default FedAvg.');
  }

  const durationSeconds =
    experiment.startedAt && experiment.completedAt
      ? Math.round(
          (new Date(experiment.completedAt).getTime() -
            new Date(experiment.startedAt).getTime()) /
            1000
        )
      : null;

  return {
    id: experiment.id,
    name: experiment.name,
    framework: experiment.framework,
    status: experiment.status,
    outcome: outcome.outcome,
    stoppedByUser: outcome.stoppedByUser,
    config: {
      numClients: experiment.numClients,
      numRounds: experiment.numRounds,
      clientFraction: experiment.clientFraction,
      localEpochs: experiment.localEpochs,
      learningRate: experiment.learningRate,
      useGpu: experiment.useGpu,
      cpusPerClient: experiment.cpusPerClient,
      gpuFractionPerClient: experiment.gpuFractionPerClient,
      customConfig: experiment.customConfig,
    },
    uploadedFiles: {
      algorithm: experiment.algorithmPath,
      model: experiment.modelPath,
      dataset: experiment.datasetPath,
      config: experiment.configPath,
    },
    metrics: summary,
    checkpointCount: checkpoints.length,
    latestCheckpointRound:
      checkpoints.length > 0 ? Math.max(...checkpoints.map((c) => c.round)) : null,
    errorMessage: experiment.errorMessage,
    notes,
    durationSeconds,
  };
}

export interface ComparisonRow {
  experimentId: string;
  name: string;
  status: string;
  outcome: string;
  numClients: number;
  numRounds: number;
  clientFraction: number;
  localEpochs: number;
  learningRate: number;
  bestEvalAccuracy: number | null;
  finalEvalAccuracy: number | null;
  finalEvalLoss: number | null;
  roundsCompleted: number;
  durationSeconds: number | null;
}

export interface Comparison {
  rows: ComparisonRow[];
  bestBy: { finalEvalAccuracy: string | null; fastestConvergence: string | null };
  /** Config fields that actually differ, so the agent compares the right things. */
  differingConfig: string[];
}

export function compareExperiments(
  entries: Array<{ experiment: Experiment; metrics: Metric[] }>
): Comparison {
  const rows: ComparisonRow[] = entries.map(({ experiment, metrics }) => {
    const summary = summariseMetrics(metrics);
    const outcome = describeExperimentOutcome(experiment);

    return {
      experimentId: experiment.id,
      name: experiment.name,
      status: experiment.status,
      outcome: outcome.outcome,
      numClients: experiment.numClients,
      numRounds: experiment.numRounds,
      clientFraction: experiment.clientFraction,
      localEpochs: experiment.localEpochs,
      learningRate: experiment.learningRate,
      bestEvalAccuracy: summary.bestEvalAccuracy,
      finalEvalAccuracy: summary.finalEvalAccuracy,
      finalEvalLoss: summary.finalEvalLoss,
      roundsCompleted: summary.rounds,
      durationSeconds:
        experiment.startedAt && experiment.completedAt
          ? Math.round(
              (new Date(experiment.completedAt).getTime() -
                new Date(experiment.startedAt).getTime()) /
                1000
            )
          : null,
    };
  });

  const scored = rows.filter((r) => r.finalEvalAccuracy != null);
  const bestFinal = scored.length
    ? scored.reduce((a, b) => (b.finalEvalAccuracy! > a.finalEvalAccuracy! ? b : a))
    : null;

  // "Fastest convergence" = reached its own best accuracy in the fewest rounds.
  const withBestRound = entries
    .map(({ experiment, metrics }) => ({
      id: experiment.id,
      bestRound: summariseMetrics(metrics).bestRound,
    }))
    .filter((e): e is { id: string; bestRound: number } => e.bestRound != null);

  const fastest = withBestRound.length
    ? withBestRound.reduce((a, b) => (b.bestRound < a.bestRound ? b : a))
    : null;

  const configKeys: Array<keyof ComparisonRow> = [
    'numClients',
    'numRounds',
    'clientFraction',
    'localEpochs',
    'learningRate',
  ];

  const differingConfig = configKeys.filter(
    (key) => new Set(rows.map((row) => row[key])).size > 1
  );

  return {
    rows,
    bestBy: {
      finalEvalAccuracy: bestFinal?.experimentId ?? null,
      fastestConvergence: fastest?.id ?? null,
    },
    differingConfig,
  };
}
