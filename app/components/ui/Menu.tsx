"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { cn } from "./cn";

/**
 * A small dropdown for actions that should not each occupy a button.
 *
 * Built on the native popover, which puts the panel in the browser's top layer.
 * That is what lets this work inside the conversation list: the list scrolls,
 * so anything positioned within it is clipped at its edge, and a menu opened on
 * the last row would have been cut in half. The top layer is outside that flow
 * entirely, and light-dismiss and Escape come with it rather than being
 * reimplemented from listeners.
 *
 * Placement is set when it opens rather than through CSS anchor positioning,
 * which is still uneven across browsers.
 */

export type MenuItem = {
    label: string;
    icon?: IconName;
    onSelect: () => void;
    /** Renders in the danger colour. Does not confirm; the caller owns that. */
    danger?: boolean;
    disabled?: boolean;
};

const GAP = 4;
const EDGE = 8;
const SIZES = {
    sm: "w-7 h-7",
    md: "w-8 h-8",
} as const;

export default function Menu({
    items,
    label = "More actions",
    align = "end",
    trigger,
    className,
    size = "md",
}: {
    items: MenuItem[];
    label?: string;
    /** Which edge of the trigger the panel lines up with. */
    align?: "start" | "end";
    /** Replaces the default three-dots glyph. */
    trigger?: ReactNode;
    className?: string;
    size?: keyof typeof SIZES;
}) {
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelId = useId();

    const place = () => {
        const panel = panelRef.current;
        const button = buttonRef.current;
        if (!panel || !button) return;

        const anchor = button.getBoundingClientRect();
        const { width, height } = panel.getBoundingClientRect();

        const below = anchor.bottom + GAP;
        const top = below + height > window.innerHeight ? anchor.top - height - GAP : below;
        const left = align === "end" ? anchor.right - width : anchor.left;

        panel.style.top = `${Math.max(EDGE, Math.min(top, window.innerHeight - height - EDGE))}px`;
        panel.style.left = `${Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE))}px`;
    };

    const toggle = () => {
        const panel = panelRef.current;
        if (!panel) return;
        if (panel.matches(":popover-open")) {
            panel.hidePopover();
            return;
        }
        panel.showPopover();
        place();
    };

    return (
        <div className={cn("shrink-0", className)}>
            <button
                ref={buttonRef}
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={label}
                title={label}
                className={cn(
                    "inline-flex items-center justify-center rounded-[var(--radius)]",
                    SIZES[size],
                    "border border-transparent text-ink-muted transition-colors",
                    "hover:bg-line hover:border-line-strong hover:text-ink",
                    "active:bg-line-strong",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    open && "bg-line border-line-strong text-ink"
                )}
            >
                {trigger ?? <Icon name="more" size={16} />}
            </button>

            <div
                ref={panelRef}
                id={panelId}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {...({ popover: "auto" } as any)}
                role="menu"
                onToggle={(e) => setOpen((e as unknown as { newState: string }).newState === "open")}
                // `inset: auto` and no margin, or the UA stylesheet centres it
                // and the coordinates set above are ignored.
                style={{ position: "fixed", inset: "auto", margin: 0 }}
                className="min-w-[10rem] py-1 rounded-[var(--radius)] border border-line bg-surface shadow-lg"
            >
                {items.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => {
                            panelRef.current?.hidePopover();
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
        </div>
    );
}
