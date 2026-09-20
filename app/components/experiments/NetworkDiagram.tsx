"use client";

import Heatmap from "./Heatmap";

type Props = {
    /** Decoded activation grids, one array per layer. */
    layers: Float32Array[][];
    weights: Array<{ layer: number; matrix: number[][] }>;
    resolution: number;
    domain?: number;
    /** Speeds the flow up while stepping through rounds. */
    active?: boolean;
};

const NEURON = 42;
const COLUMN_GAP = 132;
const ROW_GAP = 62;

/**
 * The network, with each neuron showing what it responds to.
 *
 * Every hidden unit gets its own heatmap of its activation across the input
 * plane -- which is the thing that makes a network legible rather than a box of
 * numbers. Links carry the weight between units: thickness is magnitude, colour
 * is sign, the same convention the plots use.
 */
export default function NetworkDiagram({
    layers,
    weights,
    resolution,
    domain,
    active = false,
}: Props) {
    if (layers.length === 0) return null;

    // Inputs, then one column per hidden layer.
    const columns = [2, ...layers.map((neurons) => neurons.length)];
    const tallest = Math.max(...columns);

    const width = columns.length * COLUMN_GAP + 40;
    const height = tallest * ROW_GAP + 40;

    const centreY = (count: number, index: number) =>
        height / 2 + (index - (count - 1) / 2) * ROW_GAP;

    const columnX = (index: number) => 30 + index * COLUMN_GAP;

    // Scale link width against the largest weight present, so the diagram is
    // readable whatever absolute magnitudes training happened to produce.
    const maxWeight = Math.max(
        0.1,
        ...weights.flatMap((w) => w.matrix.flat().map(Math.abs))
    );

    return (
        <div className="overflow-x-auto">
            <div className="relative" style={{ width, height, minWidth: width }}>
                <svg
                    width={width}
                    height={height}
                    className="absolute inset-0"
                    style={{ pointerEvents: "none" }}
                >
                    {weights.slice(0, layers.length).map((weight) => {
                        const targetIndex = weight.layer + 1;
                        const sourceCount = columns[weight.layer];
                        const targetCount = columns[targetIndex];

                        return weight.matrix.flatMap((row, target) =>
                            row.map((value, source) => {
                                const x1 = columnX(weight.layer) + NEURON;
                                const y1 = centreY(sourceCount, source);
                                const x2 = columnX(targetIndex);
                                const y2 = centreY(targetCount, target);
                                const magnitude = Math.abs(value) / maxWeight;

                                // A stronger weight carries its signal faster,
                                // so the eye is drawn to the connections that
                                // actually matter rather than to all of them
                                // equally.
                                const duration = active
                                    ? 0.7 / (0.35 + magnitude)
                                    : 2.2 / (0.35 + magnitude);

                                return (
                                    <path
                                        key={`${weight.layer}-${source}-${target}`}
                                        data-flow-link
                                        d={`M ${x1} ${y1} C ${x1 + 45} ${y1}, ${x2 - 45} ${y2}, ${x2} ${y2}`}
                                        fill="none"
                                        stroke={value >= 0 ? "#2563eb" : "#ea580c"}
                                        strokeOpacity={0.2 + magnitude * 0.7}
                                        strokeWidth={0.6 + magnitude * 3.4}
                                        strokeDasharray="6 4"
                                        style={{
                                            animation: `flowDash ${duration.toFixed(2)}s linear infinite`,
                                        }}
                                    />
                                );
                            })
                        );
                    })}
                </svg>

                {/* Input column: the two raw coordinates. */}
                {["X₁", "X₂"].map((label, index) => (
                    <div
                        key={label}
                        className="absolute flex items-center justify-center rounded border border-ink bg-surface text-xs font-medium text-ink"
                        style={{
                            left: columnX(0),
                            top: centreY(2, index) - NEURON / 2,
                            width: NEURON,
                            height: NEURON,
                        }}
                    >
                        {label}
                    </div>
                ))}

                {layers.map((neurons, layerIndex) =>
                    neurons.map((grid, index) => (
                        <div
                            key={`${layerIndex}-${index}`}
                            className="absolute rounded overflow-hidden border border-ink bg-surface"
                            style={{
                                left: columnX(layerIndex + 1),
                                top: centreY(neurons.length, index) - NEURON / 2,
                                width: NEURON,
                                height: NEURON,
                            }}
                            title={`Layer ${layerIndex + 1}, neuron ${index + 1}`}
                        >
                            <Heatmap
                                grid={grid}
                                resolution={resolution}
                                size={NEURON}
                                domain={domain}
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
