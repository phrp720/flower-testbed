"use client";

import { useState } from "react";
import { Badge, Icon, SectionLabel, Spinner, cn } from "@/app/components/ui";
import type { ToolCall } from "./types";

type Props = { toolCall: ToolCall };

/**
 * A completed or in-flight tool call.
 *
 * Collapsed to one line by default: a transcript full of expanded JSON is
 * unreadable, and the full input and result are one click away.
 */
export default function ToolCallCard({ toolCall }: Props) {
    const [expanded, setExpanded] = useState(false);

    const running = toolCall.status === "running";
    const failed = toolCall.status === "failed" || toolCall.isError;
    const rejected = toolCall.status === "rejected";
    const result = toolCall.resultContent?.text ?? "";

    return (
        <div className="border border-line rounded-[var(--radius)] my-2 overflow-hidden">
            <button
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-left hover:bg-surface-muted transition-colors"
            >
                <Icon
                    name="forward"
                    size={13}
                    className={cn("text-ink-subtle shrink-0 transition-transform", expanded && "rotate-90")}
                />
                {running ? (
                    <Spinner size={13} className="shrink-0 text-info" />
                ) : (
                    <Icon
                        name={failed ? "error" : rejected ? "close" : "success"}
                        size={13}
                        className={cn(
                            "shrink-0",
                            failed ? "text-danger" : rejected ? "text-ink-subtle" : "text-ok"
                        )}
                    />
                )}
                <span className="font-mono text-ink truncate">{toolCall.toolName}</span>
                {running && <Badge tone="info">running</Badge>}
                {rejected && <Badge tone="neutral">declined</Badge>}
                {toolCall.durationMs != null && !running && (
                    <span className="text-ink-subtle tabular ml-auto shrink-0">
                        {toolCall.durationMs}ms
                    </span>
                )}
            </button>

            {expanded && (
                <div className="border-t border-line px-2.5 py-2.5 space-y-2.5">
                    <div>
                        <SectionLabel className="mb-1">Input</SectionLabel>
                        <pre className="text-[11px] font-mono bg-surface-muted rounded p-2 overflow-x-auto">
                            {JSON.stringify(toolCall.input, null, 2)}
                        </pre>
                    </div>
                    {result && (
                        <div>
                            <SectionLabel className="mb-1">Result</SectionLabel>
                            <pre
                                className={cn(
                                    "text-[11px] font-mono rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap",
                                    failed
                                        ? "bg-danger-surface text-danger"
                                        : "bg-surface-muted text-ink"
                                )}
                            >
                                {result}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
