"use client";

import { useEffect, useRef } from "react";
import { Send, Square } from "lucide-react";

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

    // Grow with the content rather than scrolling a fixed-height box.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled && value.trim()) onSend();
        }
    };

    return (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
            <div className="flex items-end gap-2">
                <textarea
                    ref={ref}
                    rows={1}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder ?? "Ask about your experiments..."}
                    className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                />

                {isRunning ? (
                    <button
                        onClick={onCancel}
                        className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors shrink-0"
                    >
                        <Square className="w-4 h-4" />
                        Stop
                    </button>
                ) : (
                    <button
                        onClick={onSend}
                        disabled={disabled || !value.trim()}
                        className="flex items-center gap-1.5 bg-gray-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                        <Send className="w-4 h-4" />
                        Send
                    </button>
                )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
                Enter to send, Shift+Enter for a new line.
            </p>
        </div>
    );
}
