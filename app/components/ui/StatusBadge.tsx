import Badge, { type Tone } from "./Badge";

/**
 * An experiment's status, rendered the same way everywhere it appears.
 *
 * The list, the detail page and the chat widget each carried their own copy of
 * this colour map, which is how they drifted apart. One mapping also means a
 * status added to the runner shows up correctly in all three at once.
 */
const STATUS: Record<string, { tone: Tone; label: string; live?: boolean }> = {
    pending: { tone: "neutral", label: "Pending" },
    running: { tone: "info", label: "Running", live: true },
    completed: { tone: "ok", label: "Completed" },
    failed: { tone: "danger", label: "Failed" },
    // A user-stopped run is written as failed with an errorMessage; the detail
    // page passes this so a deliberate stop does not read as a crash.
    stopped: { tone: "neutral", label: "Stopped" },
};

export default function StatusBadge({ status }: { status: string }) {
    const entry = STATUS[status] ?? { tone: "neutral" as Tone, label: status };

    return (
        <Badge tone={entry.tone} dot={entry.live} className={entry.live ? "motion-safe:animate-pulse" : undefined}>
            {entry.label}
        </Badge>
    );
}
