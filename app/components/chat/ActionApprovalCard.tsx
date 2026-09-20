"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Loader2, X } from "lucide-react";
import DiffView from "./DiffView";
import { useDecideAction } from "@/app/hooks/useAgent";
import { RISK_LABELS, type ToolCall } from "./types";

type Props = {
    toolCall: ToolCall;
    conversationId: string;
    onDecided: () => void;
};

/**
 * The approval gate.
 *
 * The card leads with what the action does in plain language, and keeps the raw
 * payload one click below. That ordering matters: the user is judging intent, and
 * a request that does not match what was asked for should look obviously wrong.
 */
export default function ActionApprovalCard({ toolCall, conversationId, onDecided }: Props) {
    const decideAction = useDecideAction(conversationId);
    const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const decide = (decision: "approve" | "reject") => {
        setBusy(decision);
        setError(null);
        decideAction.mutate(
            { id: toolCall.id, decision },
            {
                onSuccess: () => onDecided(),
                onError: (e) =>
                    setError(e instanceof Error ? e.message : "Failed to record decision"),
                onSettled: () => setBusy(null),
            }
        );
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-5 my-3">
            <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                        {toolCall.previewSummary ?? `Run ${toolCall.toolName}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        <span className="font-mono">{toolCall.toolName}</span>
                        {" · "}
                        {RISK_LABELS[toolCall.riskLevel] ?? toolCall.riskLevel}
                    </p>
                </div>
            </div>

            {toolCall.previewDiff && (
                <div className="mt-3">
                    <DiffView diff={toolCall.previewDiff} />
                </div>
            )}

            <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
                <ChevronRight
                    className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
                />
                {expanded ? "Hide" : "Show"} exact request
            </button>

            {expanded && (
                <pre className="mt-2 text-xs font-mono bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto">
                    {JSON.stringify(toolCall.input, null, 2)}
                </pre>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex items-center gap-2">
                <button
                    onClick={() => decide("approve")}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                >
                    {busy === "approve" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    Approve
                </button>
                <button
                    onClick={() => decide("reject")}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50 transition-colors"
                >
                    {busy === "reject" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <X className="w-4 h-4" />
                    )}
                    Decline
                </button>
            </div>
        </div>
    );
}
