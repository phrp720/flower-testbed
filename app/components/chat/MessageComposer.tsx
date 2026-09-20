"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/app/components/ui";

type Props = {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onCancel: () => void;
    disabled: boolean;
    isRunning: boolean;
    placeholder?: string;
};

export default function MessageComposer({
    value,
    onChange,
    onSend,
    onCancel,
    disabled,
    isRunning,
    placeholder,
}: Props) {
    const ref = useRef<HTMLTextAreaElement>(null);

    // Grow with the content rather than scrolling inside a fixed-height box.
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
    }, [value]);

    const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!disabled && value.trim()) onSend();
        }
    };

    return (
        <div className="border-t border-line bg-surface px-4 py-3">
            <div className="flex items-end gap-2">
                <textarea
                    ref={ref}
                    rows={1}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder ?? "Ask about your experiments"}
                    className="flex-1 resize-none rounded-[var(--radius)] border border-line-strong bg-surface text-ink text-sm px-3 py-2 placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />

                {isRunning ? (
                    <Button icon="stop" onClick={onCancel} className="shrink-0">
                        Stop
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        icon="send"
                        onClick={onSend}
                        disabled={disabled || !value.trim()}
                        className="shrink-0"
                    >
                        Send
                    </Button>
                )}
            </div>
            <p className="text-[11px] text-ink-subtle mt-1.5">
                Enter to send · Shift+Enter for a new line
            </p>
        </div>
    );
}
