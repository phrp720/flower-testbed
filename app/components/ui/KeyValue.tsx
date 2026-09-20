import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A grid of label/value pairs, for configuration read-outs.
 *
 * Values sit under their labels rather than beside them, so a long value wraps
 * without dragging the label out of alignment with the column next to it.
 */
export function KeyValueGrid({
    children,
    columns = 4,
    className,
}: {
    children: ReactNode;
    columns?: 2 | 3 | 4;
    className?: string;
}) {
    return (
        <dl
            className={cn(
                "grid gap-x-6 gap-y-4 grid-cols-2",
                columns === 3 && "sm:grid-cols-3",
                columns === 4 && "sm:grid-cols-4",
                className
            )}
        >
            {children}
        </dl>
    );
}

export function KeyValue({
    label,
    value,
    mono,
}: {
    label: ReactNode;
    value: ReactNode;
    mono?: boolean;
}) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                {label}
            </dt>
            <dd className={cn("text-sm text-ink mt-1 truncate", mono && "font-mono tabular")}>
                {value}
            </dd>
        </div>
    );
}
