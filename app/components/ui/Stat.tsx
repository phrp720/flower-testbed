import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { cn } from "./cn";

/**
 * A single labelled number.
 *
 * The label sits above the value in small caps and the value carries all the
 * weight, so a row of these scans as data rather than as sentences.
 */
export default function Stat({
    label,
    value,
    hint,
    icon,
    tone,
    className,
}: {
    label: ReactNode;
    value: ReactNode;
    hint?: ReactNode;
    icon?: IconName;
    tone?: "ok" | "warn" | "danger";
    className?: string;
}) {
    return (
        <div className={cn("min-w-0", className)}>
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                {icon && <Icon name={icon} size={13} />}
                {label}
            </p>
            <p
                className={cn(
                    "text-2xl font-semibold tabular mt-1 truncate",
                    tone === "ok" && "text-ok",
                    tone === "warn" && "text-warn",
                    tone === "danger" && "text-danger",
                    !tone && "text-ink"
                )}
            >
                {value}
            </p>
            {hint && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
        </div>
    );
}
