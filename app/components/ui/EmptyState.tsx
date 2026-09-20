import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { cn } from "./cn";

/**
 * What a list shows when it has nothing in it.
 *
 * Always says what would go here and offers the action that puts something
 * there -- an empty panel with only "No data" makes the reader wonder whether
 * it is broken.
 */
export default function EmptyState({
    icon = "info",
    title,
    description,
    action,
    className,
}: {
    icon?: IconName;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col items-center text-center py-12 px-6", className)}>
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-muted text-ink-subtle mb-3">
                <Icon name={icon} size={18} />
            </span>
            <p className="text-sm font-medium text-ink">{title}</p>
            {description && (
                <p className="text-xs text-ink-muted mt-1 max-w-sm">{description}</p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
