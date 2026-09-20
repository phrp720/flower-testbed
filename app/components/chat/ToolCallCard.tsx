"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, Wrench } from "lucide-react";
import type { ToolCall } from "./types";

type Props = { toolCall: ToolCall };

/**
 * A completed or in-flight tool call. Collapsed to one line by default, because
 * a transcript full of expanded JSON is unreadable; the full input and result
 * are one click away.
 */
export default function ToolCallCard({ toolCall }: Props) {
    const [expanded, setExpanded] = useState(false);

    const running = toolCall.status === "running";
    const failed = toolCall.status === "failed" || toolCall.isError;
    const rejected = toolCall.status === "rejected";

    const result = toolCall.resultContent?.text ?? "";

    return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg my-2 overflow-hidden">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-left hover:bg-gray-100 transition-colors"
            >
                <ChevronRight
                    className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${
                        expanded ? "rotate-90" : ""
                    }`}
                />
                {running ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 shrink-0 animate-spin" />
                ) : failed ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                ) : rejected ? (
                    <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                )}
                <Wrench className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-gray-900 font-medium truncate">{toolCall.toolName}</span>
                {running && (
                    <span className="bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded text-[10px] animate-pulse shrink-0">
                        running
                    </span>
                )}
                {rejected && <span className="text-gray-500 shrink-0">declined</span>}
                {toolCall.durationMs != null && !running && (
                    <span className="text-gray-400 ml-auto shrink-0">{toolCall.durationMs}ms</span>
                )}
            </button>

            {expanded && (
                <div className="border-t border-gray-200 px-3 py-2.5 space-y-2.5 bg-white">
                    <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Input</p>
                        <pre className="text-xs font-mono bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto">
                            {JSON.stringify(toolCall.input, null, 2)}
                        </pre>
                    </div>
                    {result && (
                        <div>
                            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                                Result
                            </p>
                            <pre
                                className={`text-xs font-mono border rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap ${
                                    failed
                                        ? "bg-red-50 border-red-100 text-red-800"
                                        : "bg-gray-50 border-gray-100"
                                }`}
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
