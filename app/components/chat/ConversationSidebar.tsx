"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, Icon, cn } from "@/app/components/ui";
import { useUpdateConversation } from "@/app/hooks/useAgent";
import type { Conversation } from "./types";

type Props = {
    conversations: Conversation[];
    activeId?: string;
    onNew: () => void;
    onDelete: (conversation: Conversation) => void;
    creating: boolean;
};

/** A conversation that needs attention says so with a dot, not with colour alone. */
const STATUS_DOT: Record<string, string> = {
    running: "bg-info motion-safe:animate-pulse",
    awaiting_approval: "bg-warn",
    error: "bg-danger",
};

/**
 * One conversation in the list, with its own rename mutation.
 *
 * A component per row rather than one handler in the parent: the update hook is
 * keyed by conversation id, and hooks cannot be called inside a map.
 */
function ConversationRow({
    conversation,
    active,
    onDelete,
}: {
    conversation: Conversation;
    active: boolean;
    onDelete: (conversation: Conversation) => void;
}) {
    const update = useUpdateConversation(conversation.id);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(conversation.title);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!editing) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editing]);

    const commit = () => {
        const title = draft.trim();
        setEditing(false);
        // An unchanged or emptied title is a cancel, not a request to store "".
        if (!title || title === conversation.title) {
            setDraft(conversation.title);
            return;
        }
        update.mutate({ title });
    };

    const cancel = () => {
        setDraft(conversation.title);
        setEditing(false);
    };

    const dot = STATUS_DOT[conversation.status];

    if (editing) {
        return (
            <div className="flex items-center gap-1.5 rounded-[var(--radius)] px-1.5 py-1">
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
                    className="flex-1 min-w-0 h-7 px-1.5 rounded border border-line-strong bg-surface text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
                />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "group flex items-center gap-1 rounded-[var(--radius)] pl-2.5 pr-1 py-1.5 text-sm transition-colors",
                active
                    ? "bg-surface-muted text-ink font-medium"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink"
            )}
        >
            <Link
                href={`/testbed/chat/${conversation.id}`}
                className="flex items-center gap-2 min-w-0 flex-1"
            >
                {dot ? (
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
                ) : (
                    <Icon name="chat" size={13} className="shrink-0 opacity-60" />
                )}
                <span className="truncate">{conversation.title}</span>
            </Link>

            {/* Revealed on hover to keep a column of titles quiet, but always
                present below sm: a pointer is the only thing that can hover,
                and these are the only way to rename or remove a conversation. */}
            <div className="flex items-center shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                <Button
                    size="sm"
                    variant="ghost"
                    icon="edit"
                    title="Rename"
                    aria-label={`Rename ${conversation.title}`}
                    className="w-7 h-7"
                    onClick={() => {
                        setDraft(conversation.title);
                        setEditing(true);
                    }}
                />
                <Button
                    size="sm"
                    variant="ghost"
                    icon="delete"
                    title="Delete"
                    aria-label={`Delete ${conversation.title}`}
                    className="w-7 h-7 hover:text-danger hover:bg-danger-surface"
                    onClick={() => onDelete(conversation)}
                />
            </div>
        </div>
    );
}

export default function ConversationSidebar({
    conversations,
    activeId,
    onNew,
    onDelete,
    creating,
}: Props) {
    return (
        <aside className="w-60 shrink-0 min-h-0 flex flex-col border-r border-line">
            <div className="p-3">
                <Button
                    variant="primary"
                    icon="add"
                    size="sm"
                    onClick={onNew}
                    loading={creating}
                    className="w-full"
                >
                    New chat
                </Button>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-0.5">
                {conversations.length === 0 ? (
                    <EmptyState
                        icon="chat"
                        title="No conversations"
                        className="py-8 [&>p:first-of-type]:text-xs"
                    />
                ) : (
                    conversations.map((conversation) => (
                        <ConversationRow
                            key={conversation.id}
                            conversation={conversation}
                            active={conversation.id === activeId}
                            onDelete={onDelete}
                        />
                    ))
                )}
            </nav>
        </aside>
    );
}
