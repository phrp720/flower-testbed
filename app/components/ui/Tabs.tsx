"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { cn } from "./cn";

export type TabItem<T extends string> = {
    id: T;
    label: string;
    icon?: IconName;
    /** A quiet marker on the tab -- used here for unsaved edits behind it. */
    marked?: boolean;
};

type Props<T extends string> = {
    tabs: ReadonlyArray<TabItem<T>>;
    active: T;
    onChange: (id: T) => void;
    className?: string;
};

/**
 * An underlined tab row.
 *
 * Arrow keys move between tabs and only the active one is in the tab order,
 * which is what a tablist is expected to do -- a row of plain buttons makes a
 * keyboard user press Tab once per tab just to reach the panel.
 */
export function Tabs<T extends string>({ tabs, active, onChange, className }: Props<T>) {
    const refs = useRef<Record<string, HTMLButtonElement | null>>({});

    const onKeyDown = (event: React.KeyboardEvent) => {
        const offset =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!offset) return;

        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.id === active);
        const next = tabs[(index + offset + tabs.length) % tabs.length];
        onChange(next.id);
        refs.current[next.id]?.focus();
    };

    return (
        <div
            role="tablist"
            onKeyDown={onKeyDown}
            className={cn("flex items-center gap-1 border-b border-line", className)}
        >
            {tabs.map((tab) => {
                const selected = tab.id === active;
                return (
                    <button
                        key={tab.id}
                        ref={(node) => {
                            refs.current[tab.id] = node;
                        }}
                        role="tab"
                        id={`tab-${tab.id}`}
                        aria-selected={selected}
                        aria-controls={`panel-${tab.id}`}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            "relative flex items-center gap-2 px-3 h-9 text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-[var(--radius)]",
                            selected
                                ? "text-ink font-medium"
                                : "text-ink-muted hover:text-ink"
                        )}
                    >
                        {tab.icon && <Icon name={tab.icon} size={14} />}
                        {tab.label}
                        {tab.marked && (
                            <span
                                className="w-1.5 h-1.5 rounded-full bg-warn"
                                aria-label="unsaved changes"
                            />
                        )}
                        {/* Sits on the container's border rather than under the
                            button, so the indicator and the rule are one line. */}
                        {selected && (
                            <span className="absolute inset-x-0 -bottom-px h-px bg-ink" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export function TabPanel<T extends string>({
    id,
    active,
    children,
    className,
}: {
    id: T;
    active: T;
    children: ReactNode;
    className?: string;
}) {
    if (id !== active) return null;

    return (
        <div
            role="tabpanel"
            id={`panel-${id}`}
            aria-labelledby={`tab-${id}`}
            tabIndex={0}
            className={cn("focus-visible:outline-none", className)}
        >
            {children}
        </div>
    );
}
