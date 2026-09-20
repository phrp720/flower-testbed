"use client";

import Link from "next/link";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import type { Conversation } from "./types";

type Props = {
    conversations: Conversation[];
    activeId?: string;
    onNew: () => void;
    onDelete: (conversation: Conversation) => void;
    creating: boolean;
};

const STATUS_DOT: Record<string, string> = {
    running: "bg-blue-500 animate-pulse",
    awaiting_approval: "bg-amber-500",
    error: "bg-red-500",
};

export default function ConversationSidebar({
    conversations,
    activeId,
    onNew,
    onDelete,
    creating,
}: Props) {
    return (
        <aside className="w-64 shrink-0 bg-white rounded-lg shadow p-3 flex flex-col max-h-[calc(100vh-14rem)]">
            <button
                onClick={onNew}
                disabled={creating}
                className="flex items-center justify-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 transition-colors mb-3"
            >
                <Plus className="w-4 h-4" />
                New chat
            </button>

            <div className="overflow-y-auto -mx-1 px-1 space-y-0.5">
                {conversations.length === 0 && (
                    <p className="text-sm text-gray-500 px-2 py-4 text-center">No conversations yet.</p>
                )}

                {conversations.map((conversation) => {
                    const active = conversation.id === activeId;
                    const dot = STATUS_DOT[conversation.status];

                    return (
                        <div
                            key={conversation.id}
                            className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                                active ? "bg-gray-800 text-white" : "text-gray-700 hover:bg-gray-100"
                            }`}
                        >
                            <Link
                                href={`/testbed/chat/${conversation.id}`}
                                className="flex items-center gap-2 min-w-0 flex-1"
                            >
                                {dot ? (
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                                ) : (
                                    <MessageSquare
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                            active ? "text-gray-300" : "text-gray-400"
                                        }`}
                                    />
                                )}
                                <span className="truncate">{conversation.title}</span>
                            </Link>
                            <button
                                onClick={() => onDelete(conversation)}
                                className={`opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ${
                                    active ? "text-gray-300 hover:text-white" : "text-gray-400 hover:text-red-600"
                                }`}
                                aria-label={`Delete ${conversation.title}`}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
