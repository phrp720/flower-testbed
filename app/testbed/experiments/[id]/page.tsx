"use client";

import { use, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Dialog from "@/app/components/Dialog";
import MetricsTable from "@/app/components/MetricsTable";
import CheckpointsList from "@/app/components/CheckpointsList";
import PlaygroundView from "@/app/components/experiments/PlaygroundView";
import ModulesCard from "@/app/components/experiments/ModulesCard";
import {
  describeDataset,
  describeModel,
  describePartitioning,
  describeStrategy,
  type SetupConfig,
} from "@/app/components/experiments/describeSetup";
import LogsDialog from "@/app/components/experiments/LogsDialog";
import RenameExperimentDialog from "@/app/components/experiments/RenameExperimentDialog";
import {
  Button,
  Callout,
  Card,
  CardHeader,
  KeyValue,
  KeyValueGrid,
  LinkButton,
  Menu,
  PageHeader,
  Progress,
  SectionLabel,
  Spinner,
  Stat,
  StatusBadge,
} from "@/app/components/ui";
import {
  useDeleteExperiment,
  useDuplicateExperiment,
  useExperiment,
  useStopExperiment,
} from "@/app/hooks/useExperiments";
import { queryKeys } from "@/lib/query-keys";

type Experiment = {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  status: string;
  numClients: number;
  numRounds: number;
  clientFraction: number;
  localEpochs: number;
  learningRate: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  finalAccuracy: number | null;
  finalLoss: number | null;
  errorMessage: string | null;
  logs: string | null;
  customConfig: SetupConfig;
  algorithmPath: string | null;
  modelPath: string | null;
  configPath: string | null;
  datasetPath: string | null;
};

type Metric = {
  id: string;
  round: number;
  trainLoss: number | null;
  trainAccuracy: number | null;
  evalLoss: number | null;
  evalAccuracy: number | null;
  createdAt: string;
};

type Checkpoint = {
  id: string;
  round: number;
  filePath: string;
  accuracy: number | null;
  loss: number | null;
  createdAt: string;
};

type LatestMetrics = {
  round: number;
  trainLoss: number;
  trainAccuracy: number;
  evalLoss: number;
  evalAccuracy: number;
};

type StreamUpdate = {
  experiment: {
    id: string;
    name: string;
    status: string;
    currentRound: number;
    totalRounds: number;
  };
  metrics: Metric[];
  checkpoints: Checkpoint[];
  latestMetrics: LatestMetrics | null;
  status?: string;
  final?: boolean;
};

export default function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useExperiment(id);
  const stopExperiment = useStopExperiment();
  const duplicateExperiment = useDuplicateExperiment();
  const deleteExperiment = useDeleteExperiment();

  const experiment = (data?.experiment ?? null) as Experiment | null;
  const metrics = (data?.metrics ?? []) as Metric[];
  const checkpoints = (data?.checkpoints ?? []) as Checkpoint[];

  // The stream's latestMetrics is just the last row of the same series, so
  // derive it rather than tracking a second copy that can disagree.
  const currentMetrics = (metrics[metrics.length - 1] ?? null) as LatestMetrics | null;

  const isStopping = stopExperiment.isPending;
  const isDeleting = deleteExperiment.isPending;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  // Set up SSE for real-time updates
  useEffect(() => {
    if (!experiment || (experiment.status !== 'running' && experiment.status !== 'pending')) {
      return;
    }

    const eventSource = new EventSource(`/api/experiments/${id}/stream`);

    eventSource.onmessage = (event) => {
      const data: StreamUpdate = JSON.parse(event.data);

      if (data.final) {
        // The run reached a terminal state; refetch for the fields the stream
        // does not carry, such as the captured logs.
        void queryClient.invalidateQueries({ queryKey: queryKeys.experiments.detail(id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.experiments.list() });
        eventSource.close();
        return;
      }

      // Push the snapshot straight into the cache rather than into component
      // state, so the cache stays the single source of truth and anything else
      // reading this experiment sees the update too.
      queryClient.setQueryData(
        queryKeys.experiments.detail(id),
        (previous: { experiment: Experiment; metrics: Metric[]; checkpoints: Checkpoint[] } | undefined) => {
          if (!previous) return previous;
          return {
            ...previous,
            experiment: data.experiment
              ? { ...previous.experiment, status: data.experiment.status }
              : previous.experiment,
            // Re-attach per-client metrics the stream omits for older rounds,
            // so switching rounds in the topology view still has its data.
            metrics: data.metrics?.length
              ? data.metrics.map((row) => {
                  const withClients = row as Metric & { clientMetrics?: unknown };
                  if (withClients.clientMetrics != null) return withClients;
                  const earlier = previous.metrics.find((m) => m.round === row.round) as
                    | (Metric & { clientMetrics?: unknown })
                    | undefined;
                  return earlier?.clientMetrics != null
                    ? { ...withClients, clientMetrics: earlier.clientMetrics }
                    : withClients;
                })
              : previous.metrics,
            checkpoints: data.checkpoints?.length ? data.checkpoints : previous.checkpoints,
          };
        }
      );
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [experiment?.status, id, queryClient]);

  if (loading) {
    return (
      <Card className="flex justify-center py-20">
        <Spinner size={18} label="Loading experiment" />
      </Card>
    );
  }

  if (!experiment) {
    return (
      <Card className="py-16 text-center">
        <p className="text-sm font-medium text-ink">Experiment not found</p>
        <p className="text-xs text-ink-muted mt-1">
          It may have been deleted, or the link may be wrong.
        </p>
        <LinkButton href="/testbed/experiments" icon="back" className="mt-4">
          Back to experiments
        </LinkButton>
      </Card>
    );
  }

  // A user-stopped run is recorded as failed with this exact message; showing
  // it as a crash would misrepresent a deliberate action.
  const wasStopped =
    experiment.status === 'failed' && experiment.errorMessage === 'Stopped by user';
  const displayStatus = wasStopped ? 'stopped' : experiment.status;
  const isActive = experiment.status === 'running' || experiment.status === 'pending';

  const formatDuration = (from: string, to: string) => {
    const seconds = Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const currentRound = currentMetrics?.round || metrics[metrics.length - 1]?.round || 0;
  const progress = (currentRound / experiment.numRounds) * 100;
  const canShowStopButton = process.env.NODE_ENV === 'production';

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleStopExperiment = () => {
    stopExperiment.mutate(id, {
      onError: (error) => {
        setDialog({
          isOpen: true,
          title: 'Error',
          message: error instanceof Error ? error.message : 'Failed to stop experiment. Please try again.',
          type: 'error',
        });
      },
    });
  };

  const confirmDelete = () => {
    deleteExperiment.mutate(id, {
      onSuccess: () => router.push('/testbed/experiments'),
      onError: (error) => {
        setDialog({
          isOpen: true,
          title: 'Error',
          message: error instanceof Error ? error.message : 'Failed to delete experiment. Please try again.',
          type: 'error',
        });
      },
    });
  };

  const handleDuplicate = () => {
    duplicateExperiment.mutate(
      { id },
      {
        onSuccess: ({ experiment: copy }: { experiment: Experiment }) =>
          router.push(`/testbed/experiments/${copy.id}`),
        onError: (error: unknown) =>
          setDialog({
            isOpen: true,
            title: 'Error',
            message: error instanceof Error ? error.message : 'Could not duplicate this experiment.',
            type: 'error',
          }),
      }
    );
  };

  return (
    <>
      {renaming && (
        <RenameExperimentDialog
          experimentId={id}
          name={experiment.name}
          description={experiment.description}
          onClose={() => setRenaming(false)}
        />
      )}

      <PageHeader
        title={experiment.name}
        description={experiment.description ?? undefined}
        backHref="/testbed/experiments"
        actions={
          <>
            <StatusBadge status={displayStatus} />
            {/* Always offered, including mid-run: the logs stream now, and a
                button that appears only once a run is over is useless exactly
                when someone wants to watch it. */}
            <Button
              variant="ghost"
              icon="logs"
              title="Execution logs"
              onClick={() => setShowLogs(true)}
            />

            <Menu
              label="Experiment actions"
              items={[
                { label: "Rename", icon: "edit", onSelect: () => setRenaming(true) },
                { label: "Duplicate", icon: "copy", onSelect: handleDuplicate },
              ]}
            />
            {canShowStopButton && isActive && (
              <Button
                variant="secondary"
                icon="stop"
                loading={isStopping}
                disabled={isDeleting}
                onClick={handleStopExperiment}
              >
                {isStopping ? "Stopping" : "Stop"}
              </Button>
            )}
            <Button
              variant="ghost"
              icon="delete"
              title="Delete experiment"
              className="hover:text-danger hover:bg-danger-surface"
              loading={isDeleting}
              disabled={isStopping}
              onClick={handleDeleteClick}
            />
          </>
        }
      />

      {experiment.status === 'running' && (
        <Card className="mb-5">
          <div className="flex items-baseline justify-between mb-2.5">
            <SectionLabel>Progress</SectionLabel>
            <span className="text-xs text-ink-muted tabular">
              round {currentRound} of {experiment.numRounds}
            </span>
          </div>
          <Progress value={progress / 100} className="h-2" />

          {currentMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-line">
              <Stat
                label="Train loss"
                value={currentMetrics.trainLoss?.toFixed(4) ?? "—"}
              />
              <Stat
                label="Train accuracy"
                value={
                  currentMetrics.trainAccuracy != null
                    ? `${(currentMetrics.trainAccuracy * 100).toFixed(1)}%`
                    : "—"
                }
              />
              <Stat label="Eval loss" value={currentMetrics.evalLoss?.toFixed(4) ?? "—"} />
              <Stat
                label="Eval accuracy"
                value={
                  currentMetrics.evalAccuracy != null
                    ? `${(currentMetrics.evalAccuracy * 100).toFixed(1)}%`
                    : "—"
                }
              />
            </div>
          )}
        </Card>
      )}

      {experiment.status === 'completed' && (
        <Card className="mb-5">
          <CardHeader title="Results" className="mb-5" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <Stat
              label="Final accuracy"
              value={
                experiment.finalAccuracy != null
                  ? `${(experiment.finalAccuracy * 100).toFixed(2)}%`
                  : "—"
              }
              tone="ok"
            />
            <Stat label="Final loss" value={experiment.finalLoss?.toFixed(4) ?? "—"} />
            <Stat
              label="Duration"
              value={
                experiment.startedAt && experiment.completedAt
                  ? formatDuration(experiment.startedAt, experiment.completedAt)
                  : "—"
              }
            />
            {checkpoints.length > 0 && (
              <div>
                <SectionLabel>Final model</SectionLabel>
                <a
                  href={`/api/checkpoints/${checkpoints[checkpoints.length - 1]?.filePath}`}
                  download
                  className="inline-flex items-center gap-2 h-8 px-3 mt-2 rounded-[var(--radius)] border border-line-strong bg-surface text-xs font-medium text-ink hover:bg-surface-hover transition-colors"
                >
                  Download
                </a>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* A stopped run needs a word of explanation, because "failed" is how it
          is recorded and that is not what happened. A genuine failure does not:
          the status badge already says so, and the reason -- with its traceback,
          which is the part worth reading -- is in the execution logs rather than
          reproduced here as a wall of red. */}
      {wasStopped && (
        <Callout tone="neutral" title="Stopped by user" className="mb-5">
          <p>The run was ended before it finished, so its results are partial.</p>
        </Callout>
      )}

      <div className="mb-5">
        <PlaygroundView
          experimentId={id}
          status={experiment.status}
          rounds={metrics.map((m) => m.round)}
          latestAccuracy={metrics[metrics.length - 1]?.evalAccuracy ?? null}
          latestLoss={metrics[metrics.length - 1]?.evalLoss ?? null}
        />
      </div>

      <Card className="mb-5">
        <CardHeader title="Configuration" className="mb-5" />
        <KeyValueGrid>
          <KeyValue label="Framework" value={experiment.framework} />
          <KeyValue label="Clients" value={experiment.numClients} mono />
          <KeyValue label="Rounds" value={experiment.numRounds} mono />
          <KeyValue
            label="Client fraction"
            value={`${(experiment.clientFraction * 100).toFixed(0)}%`}
            mono
          />
          <KeyValue label="Local epochs" value={experiment.localEpochs} mono />
          <KeyValue label="Learning rate" value={experiment.learningRate} mono />

          {/* The three choices that change a run most, and the three the page
              never mentioned: all of them live in custom_config or in the
              presence of an upload rather than in a column, so a run configured
              through the agent used to look exactly like a default one. */}
          <KeyValue label="Dataset" value={describeDataset(experiment.customConfig, experiment.datasetPath)} />
          <KeyValue
            label="Partitioning"
            value={describePartitioning(experiment.customConfig, experiment.datasetPath)}
          />
          <KeyValue
            label="Strategy"
            value={describeStrategy(experiment.customConfig, experiment.algorithmPath)}
          />
          {describeModel(experiment.customConfig, experiment.modelPath) && (
            <KeyValue
              label="Model"
              value={describeModel(experiment.customConfig, experiment.modelPath)}
            />
          )}
          <KeyValue
            label="Created"
            value={new Date(experiment.createdAt).toLocaleString()}
          />
          {experiment.completedAt && (
            <KeyValue
              label="Completed"
              value={new Date(experiment.completedAt).toLocaleString()}
            />
          )}
        </KeyValueGrid>
      </Card>

      <ModulesCard
        experimentId={id}
        algorithmPath={experiment.algorithmPath}
        modelPath={experiment.modelPath}
        configPath={experiment.configPath}
        datasetPath={experiment.datasetPath}
        datasetKind={experiment.customConfig?.dataset?.kind ?? null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MetricsTable metrics={metrics} />
        <CheckpointsList
          checkpoints={checkpoints}
          experimentId={id}
          experimentStatus={experiment.status}
          totalRounds={experiment.numRounds}
        />
      </div>

      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => {
          if (!isDeleting) setShowDeleteDialog(false);
        }}
        title="Delete experiment"
        message="This removes the experiment, its metrics and its checkpoints. It cannot be undone."
        type="confirm"
        onConfirm={confirmDelete}
        confirmText="Delete"
        isLoading={isDeleting}
        loadingText="Deleting"
      />

      <Dialog
        isOpen={dialog.isOpen}
        onClose={() => setDialog({ ...dialog, isOpen: false })}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
      />

      {/* Opens regardless of whether logs exist yet: a run that has just
          started has none, and refusing to open is indistinguishable from a
          broken button. */}
      <LogsDialog
        open={showLogs}
        onClose={() => setShowLogs(false)}
        experimentId={id}
        title={experiment.name}
      />
    </>
  );
}
