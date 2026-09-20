import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info";

const TONES: Record<Tone, string> = {
    neutral: "bg-surface-muted text-ink-muted border-line",
    ok: "bg-ok-surface text-ok border-ok-line",
    warn: "bg-warn-surface text-warn border-warn-line",
    danger: "bg-danger-surface text-danger border-danger-line",
    info: "bg-info-surface text-info border-info-line",
};

/**
 * A small status label.
 *
 * Tones map to meaning, never to decoration, so a colour on this page means
 * the same thing as that colour on any other. `dot` adds a leading marker for
 * places where the label alone is easy to skim past, like a live status.
 */
export default function Badge({
    children,
    tone = "neutral",
    dot,
    className,
}: {
    children: ReactNode;
    tone?: Tone;
    dot?: boolean;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                TONES[tone],
                className
            )}
        >
            {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
            {children}
        </span>
    );
}
