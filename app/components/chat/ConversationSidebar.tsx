"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, Icon, Menu, cn, CONTROL } from "@/app/components/ui";
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
                // The sidebar is narrow enough that most titles truncate. The
                // native tooltip is the right tool: it waits before appearing,
                // so it never fires while someone is just moving the pointer
                // down the list.
                title={conversation.title}
                className="flex items-center gap-2 min-w-0 flex-1"
            >
                {dot ? (
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
                ) : (
                    <Icon name="chat" size={13} className="shrink-0 opacity-60" />
                )}
                <span className="truncate">{conversation.title}</span>
            </Link>

            <Menu
                label={`Actions for ${conversation.title}`}
                size="sm"
                className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity"
                items={[
                    {
                        label: "Rename",
                        icon: "edit",
                        onSelect: () => {
                            setDraft(conversation.title);
                            setEditing(true);
                        },
                    },
                    {
                        label: "Delete",
                        icon: "delete",
                        danger: true,
                        onSelect: () => onDelete(conversation),
                    },
                ]}
            />
        </div>
    );
}

/**
 * Below this many conversations the list is scannable and a search box is just
 * a control taking up the space it would save.
 */
const SEARCH_FROM = 6;

export default function ConversationSidebar({
    conversations,
    activeId,
    onNew,
    onDelete,
    creating,
}: Props) {
    const [query, setQuery] = useState("");

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return conversations;
        return conversations.filter((c) => c.title.toLowerCase().includes(needle));
    }, [conversations, query]);

    const searchable = conversations.length >= SEARCH_FROM;

    return (
        <aside className="w-60 shrink-0 min-h-0 flex flex-col border-r border-line">
            <div className="p-3 space-y-2">
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

                {searchable && (
                    <div className="relative">
                        <Icon
                            name="search"
                            size={13}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search"
                            aria-label="Search conversations"
                            className={`${CONTROL} h-8 pl-7 pr-2 text-xs`}
                        />
                    </div>
                )}
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-0.5">
                {conversations.length === 0 ? (
                    <EmptyState
                        icon="chat"
                        title="No conversations"
                        className="py-8 [&>p:first-of-type]:text-xs"
                    />
                ) : matches.length === 0 ? (
                    <EmptyState
                        icon="search"
                        title="No matches"
                        // Titles are generated from the opening message, so say
                        // what was searched rather than implying the whole
                        // transcript was.
                        description="Searches titles only."
                        className="py-8 [&>p:first-of-type]:text-xs"
                    />
                ) : (
                    matches.map((conversation) => (
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
