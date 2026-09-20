"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Icon from "@/app/components/ui/Icon";
import { cn } from "@/app/components/ui/cn";

type Props = {
    id?: string;
    accept?: string;
    hint?: string;
    /**
     * The selected file, owned by the caller.
     *
     * The caller already holds it to submit the form, so keeping a second copy
     * in here would be two sources of truth for one fact -- and they can
     * disagree, which is exactly how the filled state went missing before.
     */
    file: File | null;
    onFileSelect: (file: File | null) => void;
};

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/**
 * A dropzone for one optional file.
 *
 * The zone collapses into a filled row once something is chosen, so a form with
 * four of these does not stay four large empty rectangles after they are used.
 */
export default function SingleFileUploader({
    id = "single-uploader",
    accept = "*",
    hint = "Drop a file",
    file,
    onFileSelect,
}: Props) {
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const select = useCallback(
        (next: File | null) => onFileSelect(next),
        [onFileSelect]
    );

    const onChange = (event: ChangeEvent<HTMLInputElement>) =>
        select(event.target.files?.[0] ?? null);

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        select(event.dataTransfer.files?.[0] ?? null);
    };

    const setDrag = (value: boolean) => (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(value);
    };

    const remove = () => {
        select(null);
        // Clearing the input matters: without it, re-picking the same file
        // fires no change event and the field silently stays empty.
        if (inputRef.current) inputRef.current.value = "";
    };

    if (file) {
        return (
            <div className="flex items-center gap-2.5 rounded-[var(--radius)] border border-line bg-surface-muted px-3 py-2">
                <Icon name="attach" size={15} className="text-ink-muted shrink-0" />
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink truncate">{file.name}</p>
                    <p className="text-[11px] text-ink-subtle tabular">{formatSize(file.size)}</p>
                </div>
                <button
                    type="button"
                    onClick={remove}
                    aria-label={`Remove ${file.name}`}
                    className="flex items-center justify-center w-7 h-7 rounded-[var(--radius)] text-ink-subtle hover:text-danger hover:bg-danger-surface transition-colors shrink-0"
                >
                    <Icon name="close" size={14} />
                </button>
            </div>
        );
    }

    return (
        <label
            htmlFor={id}
            onDrop={onDrop}
            onDragOver={setDrag(true)}
            onDragLeave={setDrag(false)}
            className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-[var(--radius)] border border-dashed px-3 py-4 cursor-pointer transition-colors",
                dragging
                    ? "border-ink-subtle bg-surface-muted"
                    : "border-line-strong bg-surface hover:bg-surface-muted"
            )}
        >
            <input
                id={id}
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={false}
                className="sr-only"
                onChange={onChange}
            />
            <Icon name="attach" size={16} className="text-ink-subtle" />
            <p className="text-xs text-ink-muted">{hint}</p>
            <p className="text-[11px] text-ink-subtle">
                {accept === "*" ? "any file" : accept}
            </p>
        </label>
    );
}
