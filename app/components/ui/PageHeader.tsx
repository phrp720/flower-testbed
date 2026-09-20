import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "./Icon";
import { cn } from "./cn";

/**
 * The title block every page opens with.
 *
 * Identical placement and weight across pages is most of what makes an app
 * feel like one app; `backHref` renders in the same spot every time so the way
 * out never moves.
 */
export default function PageHeader({
    title,
    description,
    actions,
    backHref,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    backHref?: string;
    className?: string;
}) {
    return (
        <header className={cn("flex items-start justify-between gap-4 mb-6", className)}>
            <div className="flex items-start gap-2.5 min-w-0">
                {backHref && (
                    <Link
                        href={backHref}
                        aria-label="Back"
                        className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-[var(--radius)] text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors shrink-0"
                    >
                        <Icon name="back" size={16} />
                    </Link>
                )}
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold text-ink truncate">{title}</h1>
                    {description && (
                        <p className="text-sm text-ink-muted mt-0.5">{description}</p>
                    )}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
    );
}
