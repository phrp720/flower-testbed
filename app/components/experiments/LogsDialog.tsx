"use client";

import { useEffect } from "react";
import Button from "@/app/components/ui/Button";
import CopyButton from "@/app/components/ui/CopyButton";
import Icon from "@/app/components/ui/Icon";

/**
 * A run's captured stdout, in a full-height sheet.
 *
 * Wider and taller than Dialog because logs are read by scanning rather than
 * by reading a sentence, and a narrow column turns every wrapped line into two.
 */
export default function LogsDialog({
    open,
    onClose,
    logs,
    title,
}: {
    open: boolean;
    onClose: () => void;
    logs: string;
    title: string;
}) {
    useEffect(() => {
        if (!open) return;
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onEscape);
        return () => document.removeEventListener("keydown", onEscape);
    }, [open, onClose]);

    if (!open) return null;

    const lineCount = logs.split("\n").length;

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
                    <div className="flex items-center gap-1 shrink-0">
                        <CopyButton value={logs} label="Copy" title="Copy logs" />
                        <Button size="sm" variant="ghost" icon="close" aria-label="Close" onClick={onClose} />
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-surface-muted p-3">
                    <pre className="text-xs font-mono leading-relaxed text-ink whitespace-pre-wrap break-words">
                        {logs}
                    </pre>
                </div>

                <div className="px-4 py-2.5 border-t border-line">
                    <span className="text-xs text-ink-subtle tabular">
                        {lineCount.toLocaleString()} lines
                    </span>
                </div>
            </div>
        </div>
    );
}
