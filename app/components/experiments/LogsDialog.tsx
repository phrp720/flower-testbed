"use client";

import { useEffect, useRef } from "react";
import Button from "@/app/components/ui/Button";
import CopyButton from "@/app/components/ui/CopyButton";
import Icon from "@/app/components/ui/Icon";
import Spinner from "@/app/components/ui/Spinner";
import { useExperimentLogs } from "@/app/hooks/useExperiments";

/**
 * A run's captured stdout, in a full-height sheet.
 *
 * Wider and taller than Dialog because logs are read by scanning rather than
 * by reading a sentence, and a narrow column turns every wrapped line into two.
 */
export default function LogsDialog({
    open,
    onClose,
    experimentId,
    title,
}: {
    open: boolean;
    onClose: () => void;
    experimentId: string;
    title: string;
}) {
    const { data, isLoading } = useExperimentLogs(experimentId, open);
    const logs = data?.logs ?? "";
    const live = data?.status === "running" || data?.status === "pending";

    const paneRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);

    // Follow the tail while it grows, unless the reader has scrolled up to look
    // at something -- in which case new output must not yank them away from it.
    useEffect(() => {
        const pane = paneRef.current;
        if (!pane || !stickToBottom.current) return;
        pane.scrollTop = pane.scrollHeight;
    }, [logs]);

    useEffect(() => {
        if (!open) return;
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onEscape);
        return () => document.removeEventListener("keydown", onEscape);
    }, [open, onClose]);

    if (!open) return null;

    const lineCount = logs ? logs.split("\n").length : 0;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
                style={{ animation: "fadeIn 0.15s ease-out" }}
            />

            <div
                className="relative w-full max-w-5xl h-[85vh] flex flex-col bg-surface border border-line rounded-[var(--radius)] shadow-lg overflow-hidden"
                style={{ animation: "scaleIn 0.15s ease-out" }}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-line">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Icon name="logs" size={16} className="text-ink-muted shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate">Execution logs</p>
                            <p className="text-xs text-ink-subtle truncate">{title}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {live && (
                            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                                <Spinner size={11} />
                                live
                            </span>
                        )}
                        <CopyButton value={logs} label="Copy" title="Copy logs" />
                        <Button size="sm" variant="ghost" icon="close" aria-label="Close" onClick={onClose} />
                    </div>
                </div>

                <div
                    ref={paneRef}
                    onScroll={() => {
                        const pane = paneRef.current;
                        if (!pane) return;
                        stickToBottom.current =
                            pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
                    }}
                    className="flex-1 overflow-auto bg-surface-muted p-3"
                >
                    {isLoading && !logs ? (
                        <div className="h-full flex items-center justify-center">
                            <Spinner size={14} label="Reading logs" />
                        </div>
                    ) : logs ? (
                        <pre className="text-xs font-mono leading-relaxed text-ink whitespace-pre-wrap break-words">
                            {logs}
                        </pre>
                    ) : (
                        <div className="h-full flex items-center justify-center text-xs text-ink-subtle">
                            {live ? "Waiting for the first output\u2026" : "This run produced no logs."}
                        </div>
                    )}
                </div>

                <div className="px-4 py-2.5 border-t border-line">
                    <span className="text-xs text-ink-subtle tabular">
                        {lineCount.toLocaleString()} lines
                        {live && " \u00b7 still running"}
                    </span>
                </div>
            </div>
        </div>
    );
}
