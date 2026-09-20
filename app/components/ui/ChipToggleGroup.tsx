"use client";

import { cn } from "./cn";

export type ChipOption<T extends string> = {
    value: T;
    label: string;
    /** How many rows carry this value. Shown so a filter's yield is visible before clicking. */
    count?: number;
};

type Props<T extends string> = {
    options: ReadonlyArray<ChipOption<T>>;
    selected: readonly T[];
    onChange: (next: T[]) => void;
    /** Names the group for screen readers, since the chips carry no visible heading. */
    label: string;
    className?: string;
};

/**
 * A row of toggles, any number of which can be on.
 *
 * Chosen over a multi-select dropdown because the whole set fits on one line:
 * the current selection is readable without opening anything, and changing it
 * costs one click instead of three. A dropdown only wins once the options stop
 * fitting, at which point its summary label has to truncate anyway.
 *
 * An empty selection means "no filter", which is what a filter bar with nothing
 * switched on should mean.
 */
export default function ChipToggleGroup<T extends string>({
    options,
    selected,
    onChange,
    label,
    className,
}: Props<T>) {
    const toggle = (value: T) => {
        onChange(
            selected.includes(value)
                ? selected.filter((entry) => entry !== value)
                : [...selected, value]
        );
    };

    return (
        <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1.5", className)}>
            {options.map((option) => {
                const on = selected.includes(option.value);
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => toggle(option.value)}
                        aria-pressed={on}
                        className={cn(
                            "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on
                                ? "border-accent bg-accent text-ink-inverted"
                                // Dimmed at zero, but still clickable. Disabling it
                                // would mean that with every row sharing one value --
                                // the normal case here -- only a single chip could be
                                // pressed, and a multi-select that admits one choice
                                // is just a worse dropdown.
                                : option.count === 0
                                  ? "border-line text-ink-subtle hover:bg-surface-hover"
                                  : "border-line-strong text-ink-muted hover:bg-surface-hover hover:text-ink"
                        )}
                    >
                        {option.label}
                        {option.count != null && (
                            <span className={cn("tabular text-xs", on ? "opacity-60" : "text-ink-subtle")}>
                                {option.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
