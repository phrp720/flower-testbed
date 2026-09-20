"use client";

import { useState } from "react";
import { Icon, cn } from "@/app/components/ui";

type Props = { text: string; streaming?: boolean };

/** The model's reasoning, collapsed by default. */
export default function ThinkingBlock({ text, streaming }: Props) {
    const [expanded, setExpanded] = useState(false);
    if (!text.trim()) return null;

    return (
        <div className="my-2" style={{ animation: "fadeIn 0.2s ease-out" }}>
            <button
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors"
            >
                <Icon
                    name="forward"
                    size={12}
                    className={cn("transition-transform", expanded && "rotate-90")}
                />
                <Icon name="thinking" size={12} />
                {streaming ? "Thinking..." : "Thought process"}
            </button>
            {expanded && (
                <pre className="mt-1.5 text-xs text-ink-muted whitespace-pre-wrap border-l border-line pl-3 py-1">
                    {text}
                </pre>
            )}
        </div>
    );
}
