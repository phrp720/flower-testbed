"use client";

import { useQuery } from "@tanstack/react-query";
import {
    Area,
    AreaChart,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { SectionLabel, Spinner } from "@/app/components/ui";

type FlStats = {
    rounds: number[];
    numClients: number;
    clientFraction: number;
    modelBytes: number | null;
    communicationSource: "measured" | "derived" | "unavailable";
    participation: Array<{ round: number; fit: number; evaluate: number; fraction: number }>;
    communication: Array<{ round: number; roundBytes: number; cumulativeBytes: number }>;
    clientLoss: Array<{ round: number } & Record<string, number | null>>;
    clientKeys: string[];
    convergence: Array<{ round: number; accuracy: number | null; improvement: number | null }>;
    best: { key: string; loss: number } | null;
    worst: { key: string; loss: number } | null;
};

type Props = {
    experimentId: string;
    status: string;
    /**
     * "sidebar" stacks the panels in a narrow column beside the decision
     * surface; "grid" spreads them across the full width, which is what an
     * experiment without a drawable input plane should get instead of a
     * column of charts next to empty space.
     */
    variant?: "sidebar" | "grid";
};

/** Distinguishable at small size without relying on hue alone to carry meaning. */
const CLIENT_COLOURS = [
    "#2563eb", "#ea580c", "#059669", "#7c3aed", "#db2777",
    "#0891b2", "#ca8a04", "#dc2626", "#4f46e5", "#65a30d",
];

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function Panel({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-[var(--radius)] border border-line p-3">
            <SectionLabel>{title}</SectionLabel>
            <div className="h-24 mt-2 -mx-1">{children}</div>
            {subtitle && <p className="text-[11px] text-ink-muted mt-1.5 tabular">{subtitle}</p>}
        </div>
    );
}

/**
 * The round-by-round federated series.
 *
 * These are the measurements that are about the federation rather than the
 * model: how many clients showed up, what the coordination cost, how unevenly
 * the loss is spread across them, and whether the aggregate is still improving.
 * None of it depends on the shape of the data, so it works for any experiment.
 */
export default function FlCharts({ experimentId, status, variant = "sidebar" }: Props) {
    const layout =
        variant === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
            : "space-y-3";
    const { data, isLoading } = useQuery({
        queryKey: [...queryKeys.experiments.detail(experimentId), "fl-stats"],
        queryFn: () => apiFetch<FlStats>(`/api/experiments/${experimentId}/fl-stats`),
        refetchInterval: status === "running" ? 4000 : false,
    });

    if (isLoading || !data) {
        return (
            <div className={layout}>
                {["Client participation", "Communication cost", "Client loss distribution", "Convergence rate"].map(
                    (title) => (
                        <Panel key={title} title={title}>
                            <div className="h-full flex items-center justify-center">
                                <Spinner size={14} />
                            </div>
                        </Panel>
                    )
                )}
            </div>
        );
    }

    const hasClientSeries = data.clientKeys.length > 0;
    const totalBytes = data.communication.at(-1)?.cumulativeBytes ?? 0;

    return (
        <div className={layout}>
            <Panel
                title="Client participation"
                subtitle={(() => {
                    const last = data.participation.at(-1);
                    if (!last) return `Sampling ${(data.clientFraction * 100).toFixed(0)}% of ${data.numClients} clients`;
                    return `${last.fit} of ${data.numClients} trained · ${last.evaluate} evaluated · ${(data.clientFraction * 100).toFixed(0)}% sampled`;
                })()}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.participation}>
                        <YAxis hide domain={[0, 1]} />
                        <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: "var(--radius)", border: "1px solid var(--line)", background: "var(--surface)" }}
                            formatter={(value?: number) => [value != null ? `${(value * 100).toFixed(0)}%` : "—", "training"]}
                            labelFormatter={(round) => `Round ${round}`}
                        />
                        <Area
                            type="stepAfter"
                            dataKey="fraction"
                            stroke="var(--ok)"
                            fill="var(--ok)"
                            fillOpacity={0.15}
                            strokeWidth={2}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </Panel>

            <Panel
                title="Communication cost"
                subtitle={
                    data.communicationSource === "unavailable" || !data.modelBytes
                        ? "Not recorded for this run"
                        : `${formatBytes(totalBytes)} of parameters moved · ${formatBytes(data.modelBytes)} per model` +
                          (data.communicationSource === "derived" ? " (from checkpoint)" : "")
                }
            >
                {data.communicationSource === "unavailable" ? (
                    <div className="h-full flex items-center justify-center text-xs text-ink-subtle">
                        no data
                    </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.communication}>
                        <YAxis hide />
                        <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: "var(--radius)", border: "1px solid var(--line)", background: "var(--surface)" }}
                            formatter={(value?: number) => [value != null ? formatBytes(value) : "—", "cumulative"]}
                            labelFormatter={(round) => `Round ${round}`}
                        />
                        <Area
                            type="monotone"
                            dataKey="cumulativeBytes"
                            stroke="var(--warn)"
                            fill="var(--warn)"
                            fillOpacity={0.15}
                            strokeWidth={2}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
                )}
            </Panel>

            <Panel
                title="Client loss distribution"
                subtitle={
                    hasClientSeries && data.best && data.worst
                        ? `Best ${data.best.key} (${data.best.loss.toFixed(3)}) · worst ${data.worst.key} (${data.worst.loss.toFixed(3)})`
                        : "No per-client metrics on this run"
                }
            >
                {hasClientSeries ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.clientLoss}>
                            {/* Anchoring at zero squashes every client into a
                                sliver at the top; the spread between them is
                                the whole point of this panel. */}
                            <YAxis hide domain={["dataMin", "dataMax"]} />
                            <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: "var(--radius)", border: "1px solid var(--line)", background: "var(--surface)" }}
                                formatter={(value?: number, name?: string) => [value != null ? value.toFixed(4) : "—", name ?? ""]}
                                labelFormatter={(round) => `Round ${round}`}
                            />
                            {data.clientKeys.map((key, index) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stroke={CLIENT_COLOURS[index % CLIENT_COLOURS.length]}
                                    strokeWidth={1.5}
                                    // Clients are sampled per round, so a series
                                    // can be a single point. Without a dot that
                                    // client's result draws nothing at all.
                                    dot={{ r: 2.2, strokeWidth: 0 }}
                                    isAnimationActive={false}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-xs text-ink-subtle">
                        no data
                    </div>
                )}
            </Panel>

            <Panel
                title="Convergence rate"
                subtitle={(() => {
                    const last = data.convergence.at(-1);
                    if (!last?.improvement) return "Accuracy gained per round";
                    return `${last.improvement >= 0 ? "+" : ""}${(last.improvement * 100).toFixed(2)} points last round`;
                })()}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.convergence}>
                        <YAxis hide />
                        <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: "var(--radius)", border: "1px solid var(--line)", background: "var(--surface)" }}
                            formatter={(value?: number) => [
                                value != null ? `${(value * 100).toFixed(2)} pts` : "—",
                                "gain",
                            ]}
                            labelFormatter={(round) => `Round ${round}`}
                        />
                        <Line
                            type="monotone"
                            dataKey="improvement"
                            stroke="var(--ink)"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                            connectNulls
                        />
                    </LineChart>
                </ResponsiveContainer>
            </Panel>
        </div>
    );
}
