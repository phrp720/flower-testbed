import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The one container.
 *
 * A hairline and a white fill, no shadow: at this density shadows stack into
 * visual noise, and a border states the same boundary more quietly. Padding is
 * a prop only so dense contents (tables, canvases) can opt out of it.
 */
export function Card({
    children,
    className,
    padded = true,
}: {
    children: ReactNode;
    className?: string;
    padded?: boolean;
}) {
    return (
        <section
            className={cn(
                "bg-surface border border-line rounded-[var(--radius)]",
                padded && "p-5",
                className
            )}
        >
            {children}
        </section>
    );
}

/**
 * A card's title row, with optional supporting text and trailing actions.
 *
 * Kept separate from Card so a card holding a table can put the header inside
 * the padding while the table itself runs edge to edge.
 */
export function CardHeader({
    title,
    description,
    actions,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex items-start justify-between gap-4", className)}>
            <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink">{title}</h2>
                {description && (
                    <p className="text-xs text-ink-muted mt-1">{description}</p>
                )}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
    );
}
