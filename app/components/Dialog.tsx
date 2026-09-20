"use client";

import { useEffect } from "react";
import Button from "@/app/components/ui/Button";
import Icon, { type IconName } from "@/app/components/ui/Icon";
import { cn } from "@/app/components/ui/cn";

type DialogType = "info" | "error" | "success" | "warning" | "confirm";

type DialogProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    type?: DialogType;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
    isLoading?: boolean;
    loadingText?: string;
};

const LOOK: Record<DialogType, { icon: IconName; tint: string }> = {
    info: { icon: "info", tint: "bg-surface-muted text-ink-muted" },
    error: { icon: "error", tint: "bg-danger-surface text-danger" },
    success: { icon: "success", tint: "bg-ok-surface text-ok" },
    warning: { icon: "warning", tint: "bg-warn-surface text-warn" },
    confirm: { icon: "help", tint: "bg-surface-muted text-ink-muted" },
};

/**
 * The application's only modal.
 *
 * Reserved for something the reader must answer or acknowledge before going
 * on; anything they merely need to know belongs in a Callout on the page. The
 * icon is a small tinted square rather than a large circle, so an error does
 * not shout louder than the sentence explaining it.
 */
export default function Dialog({
    isOpen,
    onClose,
    title,
    message,
    type = "info",
    onConfirm,
    confirmText = "OK",
    cancelText = "Cancel",
    isLoading = false,
    loadingText = "Working...",
}: DialogProps) {
    useEffect(() => {
        if (!isOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isLoading) onClose();
        };
        document.addEventListener("keydown", onEscape);
        return () => document.removeEventListener("keydown", onEscape);
    }, [isOpen, isLoading, onClose]);

    if (!isOpen) return null;

    const look = LOOK[type];
    const confirming = type === "confirm";

    const handleConfirm = () => {
        onConfirm?.();
        // A confirm dialog stays up while its action runs; the caller closes it
        // once the work either finishes or fails.
        if (!confirming) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={isLoading ? undefined : onClose}
        >
            <div
                className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
                style={{ animation: "fadeIn 0.15s ease-out" }}
            />

            <div
                className="relative w-full max-w-sm bg-surface border border-line rounded-[var(--radius)] shadow-lg overflow-hidden"
                style={{ animation: "scaleIn 0.15s ease-out" }}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="p-5">
                    <div className="flex items-start gap-3">
                        <span
                            className={cn(
                                "flex items-center justify-center w-8 h-8 rounded-[var(--radius)] shrink-0",
                                look.tint
                            )}
                        >
                            <Icon name={look.icon} size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h2 id="dialog-title" className="text-sm font-semibold text-ink">
                                {title}
                            </h2>
                            <p className="text-sm text-ink-muted mt-1.5 whitespace-pre-wrap break-words">
                                {message}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 bg-surface-muted border-t border-line">
                    {confirming ? (
                        <>
                            <Button size="sm" variant="ghost" onClick={onClose} disabled={isLoading}>
                                {cancelText}
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={handleConfirm}
                                loading={isLoading}
                            >
                                {isLoading ? loadingText : confirmText}
                            </Button>
                        </>
                    ) : (
                        <Button size="sm" variant="primary" onClick={onClose}>
                            {confirmText}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
