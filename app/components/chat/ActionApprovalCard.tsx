"use client";

import { useState } from "react";
import DiffView from "./DiffView";
import { Badge, Button, Callout, Icon, SectionLabel, cn } from "@/app/components/ui";
import { useDecideAction } from "@/app/hooks/useAgent";
import { RISK_LABELS, type ToolCall } from "./types";

type Props = {
    toolCall: ToolCall;
    conversationId: string;
    onDecided: () => void;
};

/** Riskier actions earn a stronger badge; nothing else about the card changes. */
const RISK_TONE: Record<string, "neutral" | "warn" | "danger"> = {
    read: "neutral",
    write: "warn",
    execute: "danger",
};

/**
 * The approval gate.
 *
 * A white card rather than an amber one. The panel already interrupts the
 * transcript by existing, and a full-bleed tint on something this tall shouts
 * without adding information -- the badge carries the same signal in the place
 * the eye already is. Colour is left to say how risky the action is.
 *
 * The summary leads and the raw payload sits one click below, because the
 * reader is judging intent: a request that does not match what they asked for
 * should look obviously wrong before they ever read the JSON.
 */
export default function ActionApprovalCard({ toolCall, conversationId, onDecided }: Props) {
    const decideAction = useDecideAction(conversationId);
    const [busy, setBusy] = useState<"approve" | "approveAll" | "reject" | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const decide = (choice: "approve" | "approveAll" | "reject") => {
        setBusy(choice);
        setError(null);
        decideAction.mutate(
            {
                id: toolCall.id,
                decision: choice === "reject" ? "reject" : "approve",
                approveAll: choice === "approveAll",
            },
            {
                onSuccess: () => onDecided(),
                onError: (e) =>
                    setError(e instanceof Error ? e.message : "Failed to record decision"),
                onSettled: () => setBusy(null),
            }
        );
    };

    const tone = RISK_TONE[toolCall.riskLevel] ?? "warn";

    return (
        <div className="my-3 rounded-[var(--radius)] border border-line-strong bg-surface overflow-hidden">
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <SectionLabel>Needs your approval</SectionLabel>
                        <p className="text-sm font-medium text-ink mt-1.5">
                            {toolCall.previewSummary ?? `Run ${toolCall.toolName}`}
                        </p>
                    </div>
                    <Badge tone={tone} className="shrink-0 mt-0.5">
                        {RISK_LABELS[toolCall.riskLevel] ?? toolCall.riskLevel}
                    </Badge>
                </div>

                <p className="text-xs font-mono text-ink-subtle mt-2">{toolCall.toolName}</p>

                {toolCall.previewDiff && (
                    <div className="mt-3">
                        <DiffView diff={toolCall.previewDiff} />
                    </div>
                )}

                <button
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="mt-3 flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
                >
                    <Icon
                        name="forward"
                        size={12}
                        className={cn("transition-transform", expanded && "rotate-90")}
                    />
                    {expanded ? "Hide" : "Show"} exact request
                </button>

                {expanded && (
                    <pre className="mt-2 text-[11px] font-mono bg-surface-muted rounded-[var(--radius)] p-2.5 overflow-x-auto">
                        {JSON.stringify(toolCall.input, null, 2)}
                    </pre>
                )}

                {error && (
                    <Callout tone="danger" className="mt-3">
                        {error}
                    </Callout>
                )}
            </div>

            {/* A tinted footer separates the decision from the description, so
                Approve is never a click away from the text being judged. */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-surface-muted border-t border-line">
                <Button
                    size="sm"
                    variant="primary"
                    icon="check"
                    onClick={() => decide("approve")}
                    loading={busy === "approve"}
                    disabled={busy !== null}
                >
                    Approve
                </Button>
                {/* The decision people actually want to make, offered where they
                    can see what they are agreeing to. The standing toggle asks
                    for the same consent before a single request exists. */}
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => decide("approveAll")}
                    loading={busy === "approveAll"}
                    disabled={busy !== null}
                    title="Approve this and stop asking for the rest of this conversation"
                >
                    Approve all
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    icon="close"
                    onClick={() => decide("reject")}
                    loading={busy === "reject"}
                    disabled={busy !== null}
                >
                    Decline
                </Button>
                <span className="ml-auto text-[11px] text-ink-subtle">
                    &ldquo;Approve all&rdquo; covers this conversation only
                </span>
            </div>
        </div>
    );
}
