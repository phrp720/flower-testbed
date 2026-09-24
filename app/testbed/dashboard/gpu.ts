import type { SystemResources } from "@/app/hooks/useExperiments";

/**
 * How the GPUs are described in one line, and in full on hover.
 *
 * Their own module rather than locals in the page, because the interesting
 * cases -- four identical cards, a mixed pair, a count with no device names --
 * are worth checking without rendering a dashboard to look at them.
 */

/**
 * Identical cards collapse to "4 x NVIDIA A100"; a mixed set is listed, because
 * "2 x NVIDIA A100" would be a lie about the second card.
 */
export function gpuSummary(resources: SystemResources): string {
    const { available, count, devices, backend } = resources.gpu;
    if (!available || count === 0) return "none";

    const names = [...new Set(devices.map((d) => d.name).filter(Boolean))];

    // A count with no usable names still says something true.
    if (names.length === 0) return `${count} × ${backend ?? "device"}`;
    if (names.length === 1) return count > 1 ? `${count} × ${names[0]}` : names[0];
    return names.join(", ");
}

/**
 * Every distinct device with its memory, plus the backend.
 *
 * Identical cards are counted rather than repeated: eight lines of the same
 * A100 is a wall of text that says one thing.
 */
export function gpuDetail(resources: SystemResources): string | undefined {
    const { available, devices, backend } = resources.gpu;
    if (!available || devices.length === 0) return undefined;

    const counts = new Map<string, number>();
    for (const device of devices) {
        const key = `${device.name}${device.memory_gb != null ? ` — ${device.memory_gb} GB` : ""}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const lines = [...counts].map(([label, n]) => (n > 1 ? `${n} × ${label}` : label));
    return backend ? `${lines.join("\n")}\n${backend}` : lines.join("\n");
}
