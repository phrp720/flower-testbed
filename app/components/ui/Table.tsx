import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A table that separates rows with hairlines and nothing else.
 *
 * No zebra striping, no vertical rules: with right-aligned numerics and
 * consistent row height, the grid is already legible, and the extra ink only
 * competes with the data.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className="overflow-x-auto">
            <table className={cn("w-full text-sm border-collapse", className)}>{children}</table>
        </div>
    );
}

export function THead({ children }: { children: ReactNode }) {
    return (
        <thead>
            <tr className="border-b border-line">{children}</tr>
        </thead>
    );
}

export function TH({
    children,
    align = "left",
    className,
}: {
    children?: ReactNode;
    align?: "left" | "right" | "center";
    className?: string;
}) {
    return (
        <th
            className={cn(
                "py-2 px-3 text-[11px] font-medium uppercase tracking-wide text-ink-subtle",
                align === "right" && "text-right",
                align === "center" && "text-center",
                align === "left" && "text-left",
                className
            )}
        >
            {children}
        </th>
    );
}

export function TBody({ children }: { children: ReactNode }) {
    return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({
    children,
    className,
    onClick,
}: {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
}) {
    return (
        <tr
            onClick={onClick}
            className={cn(onClick && "cursor-pointer hover:bg-surface-muted transition-colors", className)}
        >
            {children}
        </tr>
    );
}

export function TD({
    children,
    align = "left",
    numeric,
    className,
}: {
    children?: ReactNode;
    align?: "left" | "right" | "center";
    /** Tabular figures, so a column of changing numbers does not jitter. */
    numeric?: boolean;
    className?: string;
}) {
    return (
        <td
            className={cn(
                "py-2.5 px-3 text-ink",
                align === "right" && "text-right",
                align === "center" && "text-center",
                numeric && "tabular font-mono text-[13px]",
                className
            )}
        >
            {children}
        </td>
    );
}
