"use client";

import { useEffect, useState } from "react";
import { cn } from "@/app/components/ui";

/**
 * What the agent is doing right now, and for how long.
 *
 * Three pulsing dots alone say "something is happening" but not what, which is
 * the wrong answer during a tool call that can legitimately take a minute --
 * `wait_for_round` blocks until the federation finishes a round. Naming the
 * phase and showing elapsed time is the difference between waiting and
 * wondering whether it has hung.
 */
export default function AgentStatus({ label }: { label: string }) {
    const [seconds, setSeconds] = useState(0);

    // Counts the whole turn, not the current phase: this component mounts when
    // the turn starts and unmounts when it ends, so a bare dependency list is
    // exactly the turn's lifetime.
    useEffect(() => {
        const started = Date.now();
        const timer = setInterval(
            () => setSeconds(Math.floor((Date.now() - started) / 1000)),
            1000
        );
        return () => clearInterval(timer);
    }, []);

    return (
        <span className="inline-flex items-center gap-2 h-6 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
                {[0, 150, 300].map((delay) => (
                    <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full bg-ink-subtle motion-safe:animate-pulse"
                        style={{ animationDelay: `${delay}ms` }}
                    />
                ))}
            </span>
            <span className="truncate">{label}</span>
            {/* Held back for a few seconds so a quick reply does not flash a
                timer that is gone before it can be read. */}
            <span
                className={cn(
                    "tabular text-ink-subtle transition-opacity",
                    seconds >= 3 ? "opacity-100" : "opacity-0"
                )}
            >
                {seconds}s
            </span>
        </span>
    );
}
