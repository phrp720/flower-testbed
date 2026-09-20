"use client";

import { cn } from "@/app/components/ui";

type Props = { diff: string };

/**
 * A unified diff.
 *
 * Computed server-side and shipped as text, so the client needs no diff
 * library: rendering is only colouring by line prefix.
 */
export default function DiffView({ diff }: Props) {
    return (
        <pre className="text-[11px] font-mono border border-line rounded-[var(--radius)] overflow-x-auto max-h-80 bg-surface">
            {diff.split("\n").map((line, index) => {
                const added = line.startsWith("+") && !line.startsWith("+++");
                const removed = line.startsWith("-") && !line.startsWith("---");
                const header = line.startsWith("+++") || line.startsWith("---");

                return (
                    <div
                        key={index}
                        className={cn(
                            "px-2 py-0.5",
                            added && "bg-ok-surface text-ok",
                            removed && "bg-danger-surface text-danger",
                            header && "bg-surface-muted text-ink-subtle",
                            !added && !removed && !header && "text-ink-muted"
                        )}
                    >
                        {line || " "}
                    </div>
                );
            })}
        </pre>
    );
}
