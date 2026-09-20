"use client";

import { useState } from "react";
import { Brain, ChevronRight } from "lucide-react";

type Props = { text: string; streaming?: boolean };

/** The model's reasoning, collapsed by default. */
export default function ThinkingBlock({ text, streaming }: Props) {
    const [expanded, setExpanded] = useState(false);
    if (!text.trim()) return null;

    return (
        <div className="my-2" style={{ animation: "fadeIn 0.2s ease-out" }}>
            <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
                <ChevronRight
                    className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
                />
                <Brain className="w-3 h-3" />
                {streaming ? "Thinking..." : "Thought process"}
            </button>
            {expanded && (
                <pre className="mt-1.5 text-xs text-gray-500 whitespace-pre-wrap border-l-2 border-gray-200 pl-3 py-1">
                    {text}
                </pre>
            )}
        </div>
    );
}
