import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { cn } from "./cn";
import type { Tone } from "./Badge";

const TONES: Record<Tone, { box: string; icon: string; glyph: IconName }> = {
    neutral: { box: "bg-surface-muted border-line", icon: "text-ink-subtle", glyph: "info" },
    ok: { box: "bg-ok-surface border-ok-line", icon: "text-ok", glyph: "success" },
    warn: { box: "bg-warn-surface border-warn-line", icon: "text-warn", glyph: "warning" },
    danger: { box: "bg-danger-surface border-danger-line", icon: "text-danger", glyph: "error" },
    info: { box: "bg-info-surface border-info-line", icon: "text-info", glyph: "info" },
};

/**
 * An inline note attached to the thing it is about.
 *
 * For anything the reader needs while looking at the page. A modal is for
 * something they have to answer; this is for something they have to know.
 */
export default function Callout({
    tone = "neutral",
    title,
    children,
    icon,
    actions,
    className,
}: {
    tone?: Tone;
    title?: ReactNode;
    children?: ReactNode;
    icon?: IconName;
    actions?: ReactNode;
    className?: string;
}) {
    const style = TONES[tone];

    return (
        <div
            className={cn(
                "flex items-start gap-3 rounded-[var(--radius)] border p-3.5",
                style.box,
                className
            )}
        >
            <Icon name={icon ?? style.glyph} size={16} className={cn("shrink-0 mt-0.5", style.icon)} />
            <div className="min-w-0 flex-1 text-sm">
                {title && <p className="font-medium text-ink">{title}</p>}
                {children && <div className={cn("text-ink-muted", title && "mt-1")}>{children}</div>}
            </div>
            {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
    );
}
