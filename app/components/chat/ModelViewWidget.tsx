"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { decodeGrid } from "@/lib/grid";
import Heatmap from "@/app/components/experiments/Heatmap";
import NetworkDiagram from "@/app/components/experiments/NetworkDiagram";
import FilterGrid from "@/app/components/experiments/FilterGrid";
import { Icon, Progress, SectionLabel, Spinner } from "@/app/components/ui";

/**
 * The picture itself, in the conversation.
 *
 * The agent cannot see an image, so describe_model_view hands it numbers and it
 * answers by pointing at the experiment page. That is the right answer for the
 * model and the wrong experience for the reader, who asked to be shown
 * something and got a link. The transcript is a browser, not a terminal: it can
 * render exactly what the page renders, from the same cached response, right
 * beside the explanation.
 *
 * Deliberately the final round only, with no scrubber. Watching the thing learn
 * over rounds is what the full page is for, and the link is one click.
 */

type SurfaceFrame = {
    round: number;
    output: string;
    layers: Array<{ layer: number; neurons: string[] }>;
    weights: Array<{ layer: number; matrix: number[][] }>;
};

type FilterFrame = {
    round: number;
    filters: string;
    filterCount: number;
    accuracy: number | null;
    perClass: Array<{ label: string; accuracy: number | null; support: number }>;
};

type ModelView = {
    ok: boolean;
    view?: "surface" | "filters" | "none";
    domain?: number;
    resolution?: number;
    hiddenSizes?: number[];
    drawnSizes?: number[];
    points?: number[][];
    labels?: number[];
    layerName?: string;
    kernelHeight?: number;
    kernelWidth?: number;
    totalFilters?: number;
    evalSamples?: number;
    evalSource?: string;
    frames?: Array<SurfaceFrame | FilterFrame>;
};

export default function ModelViewWidget({ experimentId }: { experimentId: string }) {
    /**
     * The same key and the same URL the experiment page uses, on purpose: one
     * request serves both, so asking here and then opening the page costs
     * nothing the second time.
     */
    const { data: view, isLoading } = useQuery({
        queryKey: [...queryKeys.experiments.detail(experimentId), "model-view"],
        queryFn: () =>
            apiFetch<ModelView>(`/api/experiments/${experimentId}/model-view?resolution=40`),
        staleTime: Infinity,
        retry: false,
    });

    if (isLoading) {
        return (
            <div className="border border-line rounded-[var(--radius)] px-4 py-3 my-2">
                <Spinner size={13} label="Drawing what the model learned" />
            </div>
        );
    }

    const frames = view?.frames ?? [];
    const drawable = view?.ok && view.view !== "none" && frames.length > 0;

    // Nothing to draw is not an error worth a box of its own; the agent has
    // already said so in words.
    if (!drawable) return null;

    const last = frames[frames.length - 1];

    return (
        <div className="border border-line rounded-[var(--radius)] p-4 my-3">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                        {view.view === "surface"
                            ? "What the network learned"
                            : "First-layer filters"}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                        Round {last.round}
                        {view.view === "filters" && view.layerName ? ` · ${view.layerName}` : ""}
                    </p>
                </div>

                <Link
                    href={`/testbed/experiments/${experimentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors shrink-0"
                >
                    Full view
                    <Icon name="external" size={12} />
                </Link>
            </div>

            {view.view === "surface" ? (
                <SurfacePair frame={last as SurfaceFrame} view={view} />
            ) : (
                <FilterPair frame={last as FilterFrame} view={view} />
            )}
        </div>
    );
}

/**
 * Both halves of the surface view, the same pair the experiment page shows.
 *
 * The output alone answers "did it learn"; the hidden layers answer "how", and
 * that second one is usually the actual question. They wrap rather than sitting
 * side by side, because the transcript column is much narrower than the page.
 */
function SurfacePair({ frame, view }: { frame: SurfaceFrame; view: ModelView }) {
    const resolution = view.resolution ?? 40;

    const layers = useMemo(
        () => frame.layers.map((layer) => layer.neurons.map(decodeGrid)),
        [frame]
    );
    const output = useMemo(() => decodeGrid(frame.output), [frame]);

    return (
        <div className="flex flex-wrap items-start gap-6">
            <div className="min-w-0">
                <SectionLabel className="mb-2">Hidden layers</SectionLabel>
                <NetworkDiagram
                    layers={layers}
                    weights={frame.weights}
                    resolution={resolution}
                    domain={view.domain}
                />
                {/* A wide layer is drawn in part, and sixteen squares standing
                    in for thirty-two is a different architecture. */}
                {truncationNote(view) && (
                    <p className="text-xs text-ink-muted mt-2 max-w-[260px]">
                        {truncationNote(view)}
                    </p>
                )}
            </div>

            <div className="shrink-0">
                <SectionLabel className="mb-2">Output</SectionLabel>
                <div className="rounded-[var(--radius)] border border-line overflow-hidden inline-block">
                    <Heatmap
                        grid={output}
                        resolution={resolution}
                        size={200}
                        points={view.points}
                        labels={view.labels}
                        domain={view.domain}
                    />
                </div>

                <div className="flex items-center gap-2 mt-2 text-xs text-ink-subtle w-[200px]">
                    <span>−1</span>
                    <span
                        className="h-2 flex-1 rounded-full"
                        style={{
                            background: "linear-gradient(to right, #ea580c, #ffffff, #2563eb)",
                        }}
                    />
                    <span>+1</span>
                </div>
            </div>
        </div>
    );
}

/**
 * The kernels and how well they actually classify, the pair the page shows.
 *
 * The filters on their own are pretty and nearly uninterpretable. What makes
 * them mean something is the breakdown beside them: thirty-two colour patches
 * plus "bird 9%, cat 12%" is a diagnosis, where either half alone is a shrug.
 */
function FilterPair({ frame, view }: { frame: FilterFrame; view: ModelView }) {
    return (
        <div className="flex flex-wrap items-start gap-6">
            <div className="min-w-0">
                <FilterGrid
                    filters={frame.filters}
                    count={frame.filterCount}
                    kernelHeight={view.kernelHeight ?? 3}
                    kernelWidth={view.kernelWidth ?? 3}
                    tile={28}
                    columns={8}
                />
            </div>

            {/* Capped: left to fill the row the bars stretched halfway across
                the transcript, which makes small differences hard to compare. */}
            <div className="flex-1 min-w-[220px] max-w-[300px]">
                <SectionLabel className="mb-2">Accuracy by class</SectionLabel>
                <div className="space-y-1.5">
                    {frame.perClass.map((entry) => (
                        <div key={entry.label} className="flex items-center gap-2">
                            <span className="text-xs text-ink-muted w-20 shrink-0 truncate">
                                {entry.label}
                            </span>
                            <Progress value={entry.accuracy ?? 0} className="flex-1" />
                            <span className="text-xs font-mono text-ink w-9 text-right tabular">
                                {entry.accuracy != null
                                    ? `${(entry.accuracy * 100).toFixed(0)}%`
                                    : "—"}
                            </span>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-ink-muted mt-2.5">
                    {frame.accuracy != null && (
                        <>
                            Overall{" "}
                            <span className="font-mono tabular text-ink">
                                {(frame.accuracy * 100).toFixed(1)}%
                            </span>{" "}
                            ·{" "}
                        </>
                    )}
                    counted over {view.evalSamples?.toLocaleString()} images from the{" "}
                    {view.evalSource}.
                </p>
            </div>
        </div>
    );
}

/** "Showing 16 of 32, then 16 of 32 neurons.", or nothing when all are drawn. */
function truncationNote(view: ModelView): string | null {
    const full = view.hiddenSizes;
    const drawn = view.drawnSizes;
    if (!full || !drawn || full.length !== drawn.length) return null;
    if (full.every((size, index) => size === drawn[index])) return null;

    const parts = full.map((size, index) =>
        size === drawn[index] ? `${size}` : `${drawn[index]} of ${size}`
    );
    return `Showing ${parts.join(", then ")} neurons.`;
}
