"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Icon, Progress, Spinner, StatusBadge } from "@/app/components/ui";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { useExperiment } from "@/app/hooks/useExperiments";
import { queryKeys } from "@/lib/query-keys";

type Metric = {
    round: number;
    evalAccuracy: number | null;
    evalLoss: number | null;
};

type Snapshot = {
    experiment: { id: string; name: string; status: string; currentRound: number; totalRounds: number };
    metrics: Metric[];
    latestMetrics: { round: number; evalAccuracy: number | null; evalLoss: number | null } | null;
};

type Props = { experimentId: string };

// Same colour map the experiments list uses, so a run looks the same everywhere.
/**
 * A live view of an experiment, inline in the conversation.
 *
 * It subscribes to the experiment stream the monitoring page already uses, so
 * this needs no new backend and shows exactly what that page shows.
 */
export default function ExperimentWidget({ experimentId }: Props) {
    const queryClient = useQueryClient();

    // Shares a cache entry with the experiment page, so opening that page after
    // seeing this card costs no extra request.
    const { data, error } = useExperiment(experimentId);

    const snapshot: Snapshot | null = data
        ? {
              experiment: {
                  id: data.experiment.id,
                  name: data.experiment.name,
                  status: data.experiment.status,
                  currentRound: data.metrics.at(-1)?.round ?? 0,
                  totalRounds: data.experiment.numRounds,
              },
              metrics: data.metrics as Metric[],
              latestMetrics: (data.metrics.at(-1) ?? null) as Snapshot["latestMetrics"],
          }
        : null;

    // Follow it live only while there is something to follow.
    useEffect(() => {
        const status = snapshot?.experiment.status;
        if (status !== "running" && status !== "pending") return;

        const source = new EventSource(`/api/experiments/${experimentId}/stream`);
        source.onmessage = (event) => {
            const update = JSON.parse(event.data);
            if (update.final) {
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.experiments.detail(experimentId),
                });
                source.close();
                return;
            }
            if (!update.experiment) return;

            queryClient.setQueryData(
                queryKeys.experiments.detail(experimentId),
                (previous: { experiment: { status: string }; metrics: unknown[]; checkpoints: unknown[] } | undefined) =>
                    previous
                        ? {
                              ...previous,
                              experiment: { ...previous.experiment, status: update.experiment.status },
                              metrics: update.metrics?.length ? update.metrics : previous.metrics,
                              checkpoints: update.checkpoints?.length
                                  ? update.checkpoints
                                  : previous.checkpoints,
                          }
                        : previous
            );
        };
        source.onerror = () => source.close();

        return () => source.close();
    }, [experimentId, snapshot?.experiment.status, queryClient]);

    // A deleted experiment is a normal outcome here; just stop rendering.
    if (error) return null;

    if (!snapshot) {
        return (
            <div className="border border-line rounded-[var(--radius)] px-4 py-3 my-2">
                <Spinner size={13} label="Loading experiment" />
            </div>
        );
    }

    const { experiment, metrics, latestMetrics } = snapshot;
    const progress =
        experiment.totalRounds > 0
            ? Math.min(100, (experiment.currentRound / experiment.totalRounds) * 100)
            : 0;

    const chartData = metrics
        .filter((m) => m.evalAccuracy != null)
        .map((m) => ({ round: m.round, accuracy: m.evalAccuracy }));

    return (
        <div className="border border-line rounded-[var(--radius)] p-4 my-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{experiment.name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <StatusBadge status={experiment.status} />
                        <span className="text-xs text-ink-muted tabular">
                            round {experiment.currentRound} of {experiment.totalRounds}
                        </span>
                    </div>
                </div>

                <Link
                    href={`/testbed/experiments/${experiment.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors shrink-0"
                >
                    Open
                    <Icon name="external" size={12} />
                </Link>
            </div>

            {experiment.status === "running" && (
                <Progress value={progress / 100} className="mt-3" />
            )}

            {chartData.length > 1 && (
                <div className="mt-3 h-12">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <YAxis hide domain={["dataMin", "dataMax"]} />
                            <Line
                                type="monotone"
                                dataKey="accuracy"
                                stroke="var(--ink)"
                                strokeWidth={1.75}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {latestMetrics && (
                <div className="mt-2.5 flex gap-4 text-xs text-ink-muted">
                    {latestMetrics.evalAccuracy != null && (
                        <span>
                            accuracy{" "}
                            <span className="font-mono tabular text-ink">
                                {(latestMetrics.evalAccuracy * 100).toFixed(1)}%
                            </span>
                        </span>
                    )}
                    {latestMetrics.evalLoss != null && (
                        <span>
                            loss{" "}
                            <span className="font-mono tabular text-ink">
                                {latestMetrics.evalLoss.toFixed(4)}
                            </span>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
