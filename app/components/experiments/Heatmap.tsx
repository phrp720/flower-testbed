"use client";

import { useEffect, useRef } from "react";

type Props = {
    /** Row-major values in [-1, 1], length resolution². */
    grid: Float32Array;
    resolution: number;
    size: number;
    /** Data points to overlay, in domain coordinates. */
    points?: number[][];
    labels?: number[];
    domain?: number;
    className?: string;
};

/**
 * A value grid painted to canvas.
 *
 * Canvas rather than SVG because the network diagram draws one of these per
 * neuron: as SVG rects a dozen 40x40 grids is twenty thousand DOM nodes, and
 * repainting them at animation rate is hopeless. Here each plot is one element,
 * written through a single ImageData buffer.
 *
 * The palette is the diverging orange-to-blue the TensorFlow playground uses,
 * with white at zero, so anyone who has seen that tool reads this immediately.
 */
export default function Heatmap({
    grid,
    resolution,
    size,
    points,
    labels,
    domain = 6,
    className,
}: Props) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas || grid.length === 0) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        context.setTransform(1, 0, 0, 1, 0, 0);

        // Paint the grid at its own resolution into an offscreen buffer, then
        // let the canvas scale it up. Smoother than drawing one rect per cell,
        // and a fraction of the work.
        const image = context.createImageData(resolution, resolution);
        for (let row = 0; row < resolution; row += 1) {
            for (let col = 0; col < resolution; col += 1) {
                const value = Math.max(-1, Math.min(1, grid[row * resolution + col] ?? 0));
                const magnitude = Math.abs(value);
                const [r, g, b] = value >= 0 ? [37, 99, 235] : [234, 88, 12];

                // The grid's first row is the lowest y, but canvas y grows
                // downward -- flip so the plot matches the coordinate axes.
                const offset = ((resolution - 1 - row) * resolution + col) * 4;
                image.data[offset] = Math.round(255 + (r - 255) * magnitude);
                image.data[offset + 1] = Math.round(255 + (g - 255) * magnitude);
                image.data[offset + 2] = Math.round(255 + (b - 255) * magnitude);
                image.data[offset + 3] = 255;
            }
        }

        const buffer = document.createElement("canvas");
        buffer.width = resolution;
        buffer.height = resolution;
        buffer.getContext("2d")?.putImageData(image, 0, 0);

        context.imageSmoothingEnabled = true;
        context.drawImage(buffer, 0, 0, size * dpr, size * dpr);

        if (points && labels) {
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            const scale = size / (domain * 2);

            for (let i = 0; i < points.length; i += 1) {
                const [x, y] = points[i];
                context.beginPath();
                context.arc(
                    (x + domain) * scale,
                    size - (y + domain) * scale,
                    Math.max(1.5, size / 150),
                    0,
                    Math.PI * 2
                );
                context.fillStyle = labels[i] === 1 ? "#1d4ed8" : "#c2410c";
                context.fill();
                context.strokeStyle = "rgba(255,255,255,0.75)";
                context.lineWidth = 0.7;
                context.stroke();
            }
        }
    }, [grid, resolution, size, points, labels, domain]);

    return <canvas ref={ref} style={{ width: size, height: size }} className={className} />;
}
