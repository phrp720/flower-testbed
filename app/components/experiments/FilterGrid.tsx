"use client";

import { useEffect, useRef } from "react";

type Props = {
    /** base64 uint8, laid out [filter][row][col][rgb]. */
    filters: string;
    count: number;
    kernelHeight: number;
    kernelWidth: number;
    /** Drawn size of one kernel, in CSS pixels. */
    tile?: number;
    columns?: number;
};

/**
 * The first convolution's kernels, drawn as the colour patches they are.
 *
 * A kernel that sees raw pixels is an image: a 3x3x3 weight is literally a
 * tiny RGB patch, and what it has learned to respond to is visible directly.
 * Each is painted at its true size and scaled up with smoothing off, so a
 * 3x3 kernel stays nine honest squares rather than becoming a blur.
 */
export default function FilterGrid({
    filters,
    count,
    kernelHeight,
    kernelWidth,
    tile = 34,
    columns = 8,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        // Decode once: base64 -> bytes, three per pixel.
        const binary = atob(filters);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

        const perFilter = kernelHeight * kernelWidth * 3;
        const rows = Math.ceil(count / columns);
        const gap = 4;
        const ratio = window.devicePixelRatio || 1;

        const width = columns * tile + (columns - 1) * gap;
        const height = rows * tile + (rows - 1) * gap;

        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = false;

        // One offscreen kernel-sized buffer, reused for every filter.
        const patch = context.createImageData(kernelWidth, kernelHeight);
        const scratch = document.createElement("canvas");
        scratch.width = kernelWidth;
        scratch.height = kernelHeight;
        const scratchContext = scratch.getContext("2d");
        if (!scratchContext) return;

        for (let index = 0; index < count; index += 1) {
            const base = index * perFilter;
            if (base + perFilter > bytes.length) break;

            for (let pixel = 0; pixel < kernelHeight * kernelWidth; pixel += 1) {
                patch.data[pixel * 4] = bytes[base + pixel * 3];
                patch.data[pixel * 4 + 1] = bytes[base + pixel * 3 + 1];
                patch.data[pixel * 4 + 2] = bytes[base + pixel * 3 + 2];
                patch.data[pixel * 4 + 3] = 255;
            }

            scratchContext.putImageData(patch, 0, 0);

            const column = index % columns;
            const row = Math.floor(index / columns);
            context.drawImage(
                scratch,
                column * (tile + gap),
                row * (tile + gap),
                tile,
                tile
            );
        }
    }, [filters, count, kernelHeight, kernelWidth, tile, columns]);

    return <canvas ref={canvasRef} className="block" />;
}
