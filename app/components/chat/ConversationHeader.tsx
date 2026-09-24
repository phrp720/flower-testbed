"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, type MenuItem } from "@/app/components/ui";
import { useUpdateConversation } from "@/app/hooks/useAgent";
import type { Conversation } from "./types";

/**
 * The conversation's name, inside the panel it names.
 *
 * It used to sit above the card as a page heading, which read as a title for
 * the whole screen rather than for the thread -- and left the panel itself
 * unlabelled. Here it belongs to the transcript, with a rule under it marking
 * where the conversation starts.
 *
 * Rename and delete live behind one control rather than as two icons: a
 * destructive action sitting beside a title is a misclick waiting to happen.
 */

export default function ConversationHeader({
    conversation,
    onDelete,
}: {
    conversation: Conversation | null;
    onDelete: (conversation: Conversation) => void;
}) {
    const update = useUpdateConversation(conversation?.id ?? "");
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(conversation?.title ?? "");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!editing) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editing]);

    // A rename from the sidebar, or a title the agent generated, has to land
    // here too -- otherwise opening this menu would offer the old name back.
    useEffect(() => {
        if (!editing) setDraft(conversation?.title ?? "");
    }, [conversation?.title, editing]);

    const commit = () => {
        const title = draft.trim();
        setEditing(false);
        // An unchanged or emptied title is a cancel, not a request to store "".
        if (!conversation || !title || title === conversation.title) {
            setDraft(conversation?.title ?? "");
            return;
        }
        update.mutate({ title });
    };

    const cancel = () => {
        setDraft(conversation?.title ?? "");
        setEditing(false);
    };

    const items: MenuItem[] = [
        { label: "Rename", icon: "edit", onSelect: () => setEditing(true) },
        {
            label: "Delete",
            icon: "delete",
            danger: true,
            onSelect: () => conversation && onDelete(conversation),
        },
    ];

    return (
        <div className="shrink-0 flex items-center gap-2 border-b border-line px-5 h-12">
            {editing ? (
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commit();
                        if (e.key === "Escape") cancel();
                    }}
                    aria-label="Conversation title"
                    className="flex-1 min-w-0 h-8 px-2 rounded-[var(--radius)] border border-line-strong bg-surface text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-ring"
                />
            ) : (
                // The native tooltip rather than a custom one: it waits before
                // appearing, so it never fires while the pointer is just
                // passing over on its way somewhere else.
                <h2
                    title={conversation?.title ?? undefined}
                    className="flex-1 min-w-0 truncate text-sm font-semibold text-ink"
                >
                    {conversation?.title ?? "Chat"}
                </h2>
            )}

            {conversation && !editing && <Menu items={items} label="Conversation actions" />}
        </div>
    );
}
