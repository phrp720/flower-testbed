"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { cn } from "./cn";

/**
 * A small dropdown for actions that should not each occupy a button.
 *
 * Rename and delete sit behind one control because a destructive action next to
 * a title is a misclick waiting to happen, and because two icons beside every
 * heading is the kind of clutter this UI is trying not to have.
 *
 * Deliberately not a library: the behaviour worth getting right is closing --
 * on outside click, on Escape, and after a choice -- and that is a few lines.
 */

export type MenuItem = {
    label: string;
    icon?: IconName;
    onSelect: () => void;
    /** Renders in the danger colour. Does not confirm; the caller owns that. */
    danger?: boolean;
    disabled?: boolean;
};

export default function Menu({
    items,
    label = "More actions",
    align = "end",
    trigger,
    className,
}: {
    items: MenuItem[];
    label?: string;
    /** Which edge the panel lines up with. */
    align?: "start" | "end";
    /** Replaces the default three-dots button. */
    trigger?: ReactNode;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const panelId = useId();

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        // Capture phase, so a click that also navigates still closes this first.
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className={cn("relative shrink-0", className)}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                aria-label={label}
                title={label}
                className={cn(
                    "inline-flex items-center justify-center w-8 h-8 rounded-[var(--radius)]",
                    "text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    open && "bg-surface-hover text-ink"
                )}
            >
                {trigger ?? <Icon name="more" size={16} />}
            </button>

            {open && (
                <div
                    id={panelId}
                    role="menu"
                    className={cn(
                        "absolute top-full mt-1 z-20 min-w-[10rem] py-1",
                        "rounded-[var(--radius)] border border-line bg-surface shadow-lg",
                        align === "end" ? "right-0" : "left-0"
                    )}
                >
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            onClick={() => {
                                setOpen(false);
                                item.onSelect();
                            }}
                            className={cn(
                                "w-full flex items-center gap-2 px-3 h-8 text-sm text-left transition-colors",
                                "disabled:opacity-45 disabled:pointer-events-none",
                                item.danger
                                    ? "text-danger hover:bg-danger-surface"
                                    : "text-ink hover:bg-surface-hover"
                            )}
                        >
                            {item.icon && <Icon name={item.icon} size={14} className="shrink-0" />}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
