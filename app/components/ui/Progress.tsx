import { cn } from "./cn";

/**
 * A bar for a fraction between 0 and 1.
 *
 * Used for round progress and for the per-class accuracies, so those read as
 * the same kind of quantity in both places.
 */
export default function Progress({
    value,
    className,
    tone = "accent",
}: {
    value: number;
    className?: string;
    tone?: "accent" | "ok" | "warn" | "danger";
}) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

    return (
        <span
            className={cn("block h-1.5 rounded-full bg-surface-muted overflow-hidden", className)}
            role="progressbar"
            aria-valuenow={Math.round(clamped * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <span
                className={cn(
                    "block h-full rounded-full transition-[width] duration-500",
                    tone === "accent" && "bg-accent",
                    tone === "ok" && "bg-ok",
                    tone === "warn" && "bg-warn",
                    tone === "danger" && "bg-danger"
                )}
                style={{ width: `${clamped * 100}%` }}
            />
        </span>
    );
}
