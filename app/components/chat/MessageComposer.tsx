"use client";

import { useEffect, useRef } from "react";
import { Button, Icon, Spinner, cn } from "@/app/components/ui";
import type { Attachment } from "@/app/hooks/useAgent";

type Props = {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onCancel: () => void;
    disabled: boolean;
    isRunning: boolean;
    placeholder?: string;
    attachments: Attachment[];
    uploading: boolean;
    onAttach: (files: FileList) => void;
    onRemoveAttachment: (id: string) => void;
    /** Null before a conversation exists, when there is nothing to set it on. */
    autoRun: boolean | null;
    onToggleAutoRun: () => void;
};

/** Beyond this the box stops growing and starts scrolling. */
const MAX_HEIGHT = 200;

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function MessageComposer({
    value,
    onChange,
    onSend,
    onCancel,
    disabled,
    isRunning,
    placeholder,
    attachments,
    uploading,
    onAttach,
    onRemoveAttachment,
    autoRun,
    onToggleAutoRun,
}: Props) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    /**
     * Grow with the content, and only scroll once there is too much of it.
     *
     * The height has to be reset before reading scrollHeight, or the box can
     * only ever grow. Toggling overflow is the other half: a textarea whose
     * height is set from scrollHeight still reserves a scrollbar gutter unless
     * overflow is hidden, which is the stray scrollbar that showed on an empty
     * composer.
     */
    useEffect(() => {
        const element = textareaRef.current;
        if (!element) return;

        element.style.height = "auto";
        const needed = element.scrollHeight;
        element.style.height = `${Math.min(needed, MAX_HEIGHT)}px`;
        element.style.overflowY = needed > MAX_HEIGHT ? "auto" : "hidden";
    }, [value]);

    const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!disabled && value.trim()) onSend();
        }
    };

    const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);

    return (
        <div className="border-t border-line bg-surface px-4 py-3">
            {/* One bordered box holding the text and its controls, so the whole
                thing reads as a single field rather than a box beside a button. */}
            <div className="rounded-[var(--radius)] border border-line-strong bg-surface focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-shadow">
                {(attachments.length > 0 || uploading) && (
                    <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2.5">
                        {attachments.map((attachment) => (
                            <span
                                key={attachment.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-muted pl-2.5 pr-1 py-1 text-xs"
                                title={attachment.relativePath}
                            >
                                <Icon name="attach" size={12} className="text-ink-subtle shrink-0" />
                                <span className="max-w-[12rem] truncate text-ink">
                                    {attachment.filename}
                                </span>
                                <span className="text-ink-subtle tabular">
                                    {formatSize(attachment.sizeBytes)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onRemoveAttachment(attachment.id)}
                                    aria-label={`Remove ${attachment.filename}`}
                                    className="flex items-center justify-center w-5 h-5 rounded-full text-ink-subtle hover:text-danger hover:bg-danger-surface transition-colors"
                                >
                                    <Icon name="close" size={11} />
                                </button>
                            </span>
                        ))}
                        {uploading && <Spinner size={13} label="Uploading" />}
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder ?? "Ask about a run, or describe one to set up"}
                    className={cn(
                        "block w-full resize-none bg-transparent text-ink text-sm leading-relaxed",
                        "px-3 py-2.5 placeholder:text-ink-subtle",
                        "focus:outline-none",
                        // Set by the effect above; declared here so the first
                        // paint does not flash a scrollbar before it runs.
                        "overflow-y-hidden"
                    )}
                />

                <div className="flex items-center gap-1 px-2 pb-2">
                    <input
                        ref={fileRef}
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={(e) => {
                            if (e.target.files?.length) onAttach(e.target.files);
                            // Cleared so re-picking the same file still fires.
                            e.target.value = "";
                        }}
                    />
                    <Button
                        size="sm"
                        variant="ghost"
                        icon="attach"
                        title="Attach a file"
                        aria-label="Attach a file"
                        onClick={() => fileRef.current?.click()}
                    />

                    {/* The approval mode sits here rather than in the page
                        header: it does not describe the conversation, it
                        describes what happens when this button is pressed. */}
                    {autoRun !== null && (
                        <button
                            type="button"
                            onClick={onToggleAutoRun}
                            aria-pressed={autoRun}
                            title={
                                autoRun
                                    ? "The agent acts immediately. Click to require approval."
                                    : "Actions wait for your approval. Click to let them run."
                            }
                            className={cn(
                                "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-[11px] transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                autoRun
                                    ? "border-warn-line bg-warn-surface text-warn"
                                    : "border-line text-ink-subtle hover:text-ink hover:bg-surface-hover"
                            )}
                        >
                            <Icon name={autoRun ? "energy" : "check"} size={12} />
                            {autoRun ? "Runs without asking" : "Asks before acting"}
                        </button>
                    )}

                    <span className="ml-auto flex items-center gap-2">
                        <span className="hidden lg:inline text-[11px] text-ink-subtle">
                            Enter to send · Shift+Enter for a new line
                        </span>
                        {isRunning ? (
                            <Button size="sm" icon="stop" onClick={onCancel}>
                                Stop
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="primary"
                                icon="send"
                                onClick={onSend}
                                disabled={!canSend}
                            >
                                Send
                            </Button>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
}
