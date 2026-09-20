import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The small caps label above a group of content.
 *
 * Lighter than a heading, which keeps the page's heading hierarchy to the two
 * levels it actually needs while still marking where one group ends.
 */
export default function SectionLabel({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <p
            className={cn(
                "text-[11px] font-medium uppercase tracking-wide text-ink-subtle",
                className
            )}
        >
            {children}
        </p>
    );
}
