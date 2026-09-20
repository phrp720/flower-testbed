"use client";

import Button from "./Button";
import { cn } from "./cn";

/**
 * Previous / next with a position readout.
 *
 * Three lists paged themselves three slightly different ways before this; page
 * numbers are deliberately absent because none of these lists is long enough
 * for jumping to a page to beat simply stepping through it.
 */
export default function Pagination({
    page,
    pageCount,
    onChange,
    label = "page",
    className,
}: {
    /** 1-based. */
    page: number;
    pageCount: number;
    onChange: (page: number) => void;
    label?: string;
    className?: string;
}) {
    if (pageCount <= 1) return null;

    return (
        <div className={cn("flex items-center justify-between gap-3", className)}>
            <span className="text-xs text-ink-muted tabular">
                {label} {page} of {pageCount}
            </span>
            <div className="flex items-center gap-1.5">
                <Button
                    size="sm"
                    variant="ghost"
                    icon="back"
                    aria-label="Previous"
                    disabled={page <= 1}
                    onClick={() => onChange(page - 1)}
                />
                <Button
                    size="sm"
                    variant="ghost"
                    icon="forward"
                    aria-label="Next"
                    disabled={page >= pageCount}
                    onClick={() => onChange(page + 1)}
                />
            </div>
        </div>
    );
}
