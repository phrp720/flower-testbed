"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { decodeGrid, lerpGrids } from "@/lib/grid";
import Heatmap from "./Heatmap";
import NetworkDiagram from "./NetworkDiagram";
import FilterGrid from "./FilterGrid";
import FlCharts from "./FlCharts";
import { Button, Callout, Card, Progress, SectionLabel, Spinner } from "@/app/components/ui";

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
    inputShape?: number[];
    reason?: string;
    error?: string;

    // view === "surface"
    domain?: number;
    resolution?: number;
    hiddenSizes?: number[];
    drawnSizes?: number[];
    activationSource?: string;
    points?: number[][];
    labels?: number[];

    // view === "filters"
    layerName?: string;
    kernelHeight?: number;
    kernelWidth?: number;
    inputChannels?: number;
    totalFilters?: number;
    evalSamples?: number;
    evalSource?: string;

    frames?: Array<SurfaceFrame | FilterFrame>;
};

type Props = {
    experimentId: string;
    status: string;
    rounds: number[];
    latestAccuracy: number | null;
    latestLoss: number | null;
};

/** Milliseconds of animation per round while playing. */
const ROUND_DURATION_MS = 900;

export default function PlaygroundView({
    experimentId,
    status,
    rounds,
    latestAccuracy,
    latestLoss,
}: Props) {
    /**
     * One request covers every round, and the server decides what kind of
     * picture this model even has.
     *
     * The caller does not say which view it wants: the experiment's config
     * describes intent, not data, so the tool reads a real batch and the model's
     * own structure instead. Asking for the whole timeline at once is also what
     * makes scrubbing free -- evaluating a round server-side takes seconds.
     */
    const { data: view, isLoading } = useQuery({
        queryKey: [...queryKeys.experiments.detail(experimentId), "model-view"],
        queryFn: () =>
            apiFetch<ModelView>(`/api/experiments/${experimentId}/model-view?resolution=40`),
        enabled: rounds.length > 0,
        // A finished round never changes; recomputing it would be pure waste.
        staleTime: Infinity,
        retry: false,
    });

    const kind = view?.ok ? view.view : undefined;
    const frames = useMemo(() => view?.frames ?? [], [view]);

    const isSurface = kind === "surface" && frames.length > 0;

    /**
     * What the diagram is leaving out.
     *
     * Only the first few neurons of a layer are encoded -- a wide one would cost
     * megabytes of base64 for rows nobody can read -- so a 32-unit layer arrives
     * as 16 squares. Left unsaid, the picture describes a model that does not
     * exist.
     */
    const truncation = (() => {
        const full = view?.hiddenSizes;
        const drawn = view?.drawnSizes;
        if (!full || !drawn || full.length !== drawn.length) return null;
        if (full.every((size, index) => size === drawn[index])) return null;

        const parts = full.map((size, index) =>
            size === drawn[index] ? `${size}` : `${drawn[index]} of ${size}`
        );
        return `Showing ${parts.join(", then ")} neurons.`;
    })();
    const isFilters = kind === "filters" && frames.length > 0;
    const drawable = isSurface || isFilters;

    /** Decoded once; every scrub step reads these rather than re-decoding. */
    const surface = useMemo(() => {
        if (!isSurface) return null;
        return (frames as SurfaceFrame[]).map((frame) => ({
            round: frame.round,
            output: decodeGrid(frame.output),
            layers: frame.layers.map((layer) => layer.neurons.map(decodeGrid)),
            weights: frame.weights,
        }));
    }, [isSurface, frames]);

    const filterFrames = isFilters ? (frames as FilterFrame[]) : null;
    const frameCount = surface?.length ?? filterFrames?.length ?? 0;

    // Continuous position along the timeline: 3.4 is 40% of the way from the
    // fourth frame to the fifth.
    const [position, setPosition] = useState(0);
    const [playing, setPlaying] = useState(false);
    const frameRef = useRef<number | null>(null);

    // Land on the final round once the data arrives, which is what someone
    // opening a finished experiment wants to see first.
    useEffect(() => {
        if (frameCount > 0) setPosition(frameCount - 1);
    }, [frameCount]);

    useEffect(() => {
        if (!playing || frameCount < 2) return;

        let last = performance.now();
        const step = (now: number) => {
            const delta = (now - last) / ROUND_DURATION_MS;
            last = now;

            setPosition((current) => {
                const next = current + delta;
                return next >= frameCount - 1 ? 0 : next;
            });

            frameRef.current = requestAnimationFrame(step);
        };

        frameRef.current = requestAnimationFrame(step);
        return () => {
            if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
        };
    }, [playing, frameCount]);

    /**
     * The surface grids to draw right now.
     *
     * Between two rounds the grids are blended, so the boundary is seen
     * deforming rather than cutting. Training is discrete, so these in-between
     * frames are a reading aid; the scrubber still lands on whole rounds.
     */
    const currentSurface = useMemo(() => {
        if (!surface?.length) return null;

        const lower = Math.min(Math.floor(position), surface.length - 1);
        const upper = Math.min(lower + 1, surface.length - 1);
        const t = position - lower;

        const from = surface[lower];
        const to = surface[upper];

        if (lower === upper || t === 0) {
            return { ...from, displayRound: from.round };
        }

        return {
            round: from.round,
            displayRound: from.round + (to.round - from.round) * t,
            output: lerpGrids(from.output, to.output, t),
            layers: from.layers.map((neurons, layerIndex) =>
                neurons.map((grid, index) =>
                    lerpGrids(grid, to.layers[layerIndex]?.[index] ?? grid, t)
                )
            ),
            weights: t < 0.5 ? from.weights : to.weights,
        };
    }, [surface, position]);

    /**
     * Kernels and per-class accuracy snap to a whole round.
     *
     * Blending two rounds of a decision surface reads as the boundary bending.
     * Blending two sets of kernels would be a cross-fade between two pictures
     * of a model that never existed, so this steps instead.
     */
    const currentFilters = useMemo(() => {
        if (!filterFrames?.length) return null;
        const index = Math.min(Math.round(position), filterFrames.length - 1);
        return filterFrames[index];
    }, [filterFrames, position]);

    const resolution = view?.resolution ?? 40;
    const roundLabel = currentSurface
        ? Math.round(currentSurface.displayRound)
        : currentFilters?.round ?? rounds[rounds.length - 1];

    const subtitle = isSurface
        ? "Every point in the input plane, coloured by what the model predicts — and what each neuron responds to."
        : isFilters
        ? "The kernels this federation learned, and how well the global model does on each class."
        : "Round-by-round measurements of the federation itself.";

    return (
        <Card>
            <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                    <h2 className="text-sm font-semibold text-ink">
                        {drawable ? "What the network learned" : "Federation"}
                    </h2>
                    <p className="text-xs text-ink-muted mt-1">{subtitle}</p>
                </div>

                {drawable && frameCount > 1 && (
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            icon={playing ? "pause" : "play"}
                            onClick={() => setPlaying((v) => !v)}
                        >
                            {playing ? "Pause" : "Play"}
                        </Button>
                        <span className="text-xs text-ink-muted tabular w-16 text-right">
                            Round {roundLabel}
                        </span>
                    </div>
                )}
            </div>

            {drawable && frameCount > 1 && (
                <div className="mb-5">
                    <input
                        type="range"
                        min={0}
                        max={frameCount - 1}
                        step={0.01}
                        value={position}
                        onChange={(e) => {
                            setPlaying(false);
                            setPosition(Number(e.target.value));
                        }}
                        className="w-full accent-[var(--accent)]"
                        aria-label="Training round"
                    />
                    <div className="flex justify-between text-[11px] text-ink-subtle mt-1 tabular">
                        <span>round {frames[0].round}</span>
                        <span>round {frames[frames.length - 1].round}</span>
                    </div>
                </div>
            )}

            {/*
              * The visualisation, then the charts across the full width below.
              *
              * They used to sit in a 300px sidebar beside it, which meant the
              * taller of the two columns set the height and the shorter one
              * ended in dead space -- badly for the filters view, where kernels
              * and a class list run out long before four stacked charts do, and
              * visibly even for the surface. Stacking cannot gap whatever the
              * view turns out to be.
              */}
            <div className="space-y-5">
                <div className="min-w-0">
                    {isLoading ? (
                        <div className="h-80 flex items-center justify-center">
                            <Spinner size={16} label="Working out how this model can be shown" />
                        </div>
                    ) : currentSurface ? (
                        // Centred: the pair is narrower than the card on a wide
                        // screen, and left-aligned it piled all the slack on the
                        // right, which read as something missing.
                        <div className="flex flex-col lg:flex-row lg:justify-center gap-6">
                            <div className="min-w-0">
                                <SectionLabel className="mb-3">Hidden layers</SectionLabel>
                                <NetworkDiagram
                                    layers={currentSurface.layers}
                                    weights={currentSurface.weights}
                                    resolution={resolution}
                                    domain={view?.domain}
                                    active={playing || status === "running"}
                                />
                                <p className="text-xs text-ink-muted mt-3 max-w-sm">
                                    Each square is one neuron, coloured by how it responds across the
                                    input. Line thickness is the weight between them, and the dashes
                                    travel faster along the stronger ones.
                                    {/* A wide layer is drawn in part. Saying so
                                        matters: sixteen squares for a layer of
                                        thirty-two is a different architecture. */}
                                    {truncation && ` ${truncation}`}
                                </p>
                            </div>

                            <div className="shrink-0">
                                <SectionLabel className="mb-3">Output</SectionLabel>
                                <div className="flex gap-5 text-xs mb-3">
                                    <span className="text-ink-muted">
                                        Loss{" "}
                                        <span className="font-mono tabular text-ink">
                                            {latestLoss?.toFixed(3) ?? "—"}
                                        </span>
                                    </span>
                                    <span className="text-ink-muted">
                                        Accuracy{" "}
                                        <span className="font-mono tabular text-ink">
                                            {latestAccuracy != null ? latestAccuracy.toFixed(3) : "—"}
                                        </span>
                                    </span>
                                </div>

                                <div className="rounded-[var(--radius)] border border-line overflow-hidden inline-block">
                                    <Heatmap
                                        grid={currentSurface.output}
                                        resolution={resolution}
                                        size={280}
                                        points={view?.points}
                                        labels={view?.labels}
                                        domain={view?.domain}
                                    />
                                </div>

                                <div className="flex items-center gap-2 mt-3 text-xs text-ink-subtle">
                                    <span>−1</span>
                                    <span
                                        className="h-2.5 flex-1 rounded-full"
                                        style={{
                                            background:
                                                "linear-gradient(to right, #ea580c, #ffffff, #2563eb)",
                                        }}
                                    />
                                    <span>+1</span>
                                </div>
                                <p className="text-xs text-ink-muted mt-2 max-w-[280px]">
                                    Colour is the model&apos;s prediction; dots are the actual data,
                                    pooled across all clients. Final-round loss and accuracy shown above.
                                </p>
                            </div>
                        </div>
                    ) : currentFilters ? (
                        <div className="flex flex-col lg:flex-row lg:justify-center gap-8">
                            <div className="min-w-0">
                                <SectionLabel className="mb-3">First-layer filters</SectionLabel>
                                <FilterGrid
                                    filters={currentFilters.filters}
                                    count={currentFilters.filterCount}
                                    kernelHeight={view?.kernelHeight ?? 3}
                                    kernelWidth={view?.kernelWidth ?? 3}
                                />
                                <p className="text-xs text-ink-muted mt-3 max-w-sm">
                                    Each tile is one {view?.kernelHeight}×{view?.kernelWidth} kernel
                                    from <code className="font-mono">{view?.layerName}</code>, drawn
                                    as the colour patch it is. These weights see raw pixels, so what
                                    they respond to is visible directly. Each tile is scaled by its
                                    own range.
                                </p>
                            </div>

                            <div className="shrink-0 w-full lg:w-[280px]">
                                <SectionLabel className="mb-3">Accuracy by class</SectionLabel>
                                <div className="space-y-1.5">
                                    {currentFilters.perClass.map((entry) => (
                                        <div key={entry.label} className="flex items-center gap-2">
                                            <span className="text-xs text-ink-muted w-20 shrink-0 truncate">
                                                {entry.label}
                                            </span>
                                            <Progress value={entry.accuracy ?? 0} className="flex-1" />
                                            <span className="text-xs font-mono text-ink w-10 text-right tabular">
                                                {entry.accuracy != null
                                                    ? `${(entry.accuracy * 100).toFixed(0)}%`
                                                    : "—"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-ink-muted mt-3">
                                    {currentFilters.accuracy != null && (
                                        <>
                                            Overall{" "}
                                            <span className="font-mono tabular text-ink">
                                                {(currentFilters.accuracy * 100).toFixed(1)}%
                                            </span>{" "}
                                            ·{" "}
                                        </>
                                    )}
                                    counted over {view?.evalSamples?.toLocaleString()} images from the{" "}
                                    {view?.evalSource}.
                                </p>
                            </div>
                        </div>
                    ) : (
                         <Callout title="Nothing drawable for this model">
                            <p>
                                {view?.reason ??
                                    view?.error ??
                                    "This experiment has no saved rounds to read yet."}
                            </p>
                            {view?.inputShape && (
                                <p className="mt-2 text-xs">
                                    Input shape{" "}
                                    <code className="font-mono bg-surface border border-line rounded px-1 py-0.5">
                                        {view.inputShape.join("\u00d7")}
                                    </code>
                                    . A surface needs two inputs to sweep; filters need a
                                    convolution over pixels.
                                </p>
                            )}
                        </Callout>
                    )}
                </div>

                <FlCharts
                    experimentId={experimentId}
                    status={status}
                    variant="grid"
                />
            </div>
        </Card>
    );
}
