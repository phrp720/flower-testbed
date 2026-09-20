"use client";

import { use } from "react";
import ChatShell from "@/app/components/chat/ChatShell";

export default function ChatConversationPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    return <ChatShell conversationId={id} />;
}
