"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, Zap } from "lucide-react";
import Navigation from "@/app/components/Navigation";
import Footer from "@/app/components/Footer";
import Dialog from "@/app/components/Dialog";
import ConversationSidebar from "./ConversationSidebar";
import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import { readAgentStream } from "@/app/testbed/chat/lib/sse";
import {
    useConversations,
    useCancelTurn,
    useCreateConversation,
    useDeleteConversation,
    useThread,
    useUpdateConversation,
    type Thread,
} from "@/app/hooks/useAgent";
import { queryKeys } from "@/lib/query-keys";
import type { AgentMessage, Conversation } from "./types";

type Props = { conversationId?: string };

type DialogState = {
    isOpen: boolean;
    title: string;
    message: string;
    type: "info" | "error" | "success" | "warning" | "confirm";
    onConfirm?: () => void;
};

const CLOSED: DialogState = { isOpen: false, title: "", message: "", type: "info" };

/**
 * A stand-in for the message the user just sent, shown before the server has
 * confirmed it.
 *
 * Without this the composer clears and nothing appears until the first server
 * event arrives, so the message looks like it vanished. The id is prefixed so a
 * later refetch, which replaces the list wholesale, cannot collide with it.
 */
function optimisticMessage(text: string, seq: number): AgentMessage {
    return {
        id: `pending-${Date.now()}`,
        seq,
        role: "user",
        kind: "chat",
        content: [{ type: "text", text }],
        stopReason: null,
        inputTokens: null,
        outputTokens: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
    };
}

export default function ChatShell({ conversationId }: Props) {
    const router = useRouter();

    const queryClient = useQueryClient();

    const { data: conversations = [] } = useConversations();
    const { data: thread, isLoading: loading } = useThread(conversationId);
    const createConversation = useCreateConversation();
    const deleteConversation = useDeleteConversation();
    const cancelTurn = useCancelTurn();
    const updateConversation = useUpdateConversation(conversationId ?? "");

    const conversation = thread?.conversation ?? null;
    const toolCalls = thread?.toolCalls ?? [];

    const creating = createConversation.isPending;
    const deleting = deleteConversation.isPending;

    // The server's messages, plus anything sent but not yet acknowledged.
    const serverMessages = thread?.messages ?? [];
    const [pending, setPending] = useState<AgentMessage[]>([]);
    const messages = [...serverMessages, ...pending];

    const [input, setInput] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [streamingText, setStreamingText] = useState("");
    const [streamingThinking, setStreamingThinking] = useState("");
    const [dialog, setDialog] = useState<DialogState>(CLOSED);

    const bottomRef = useRef<HTMLDivElement>(null);

    /** Refetch the thread; used whenever the stream reports something changed. */
    const refreshThread = async () => {
        if (!conversationId) return;
        await queryClient.invalidateQueries({
            queryKey: queryKeys.agent.thread(conversationId),
        });
    };

    const onMutationError = (error: unknown) => fail(error);

    const fail = (error: unknown, title = "Error") =>
        setDialog({
            isOpen: true,
            title,
            message: error instanceof Error ? error.message : String(error),
            type: "error",
        });

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streamingText, toolCalls]);

    /**
     * Recovery channel: only opened for a conversation that is already mid-turn,
     * which happens after a refresh or in a second tab. The happy path streams
     * over the POST instead.
     */
    useEffect(() => {
        if (!conversationId || !conversation) return;
        if (conversation.status !== "running" && conversation.status !== "awaiting_approval") return;
        if (isRunning) return;

        const source = new EventSource(`/api/agent/conversations/${conversationId}/stream`);

        source.addEventListener("text_delta", (e) => {
            setIsRunning(true);
            setStreamingText((prev) => prev + JSON.parse((e as MessageEvent).data).text);
        });
        source.addEventListener("message", () => {
            setStreamingText("");
            setStreamingThinking("");
            void refreshThread();
        });
        source.addEventListener("tool_call", () => void refreshThread());
        source.addEventListener("tool_result", () => void refreshThread());
        source.addEventListener("turn_end", () => {
            setIsRunning(false);
            setStreamingText("");
            setStreamingThinking("");
            void refreshThread();
            source.close();
        });

        source.onerror = () => source.close();
        return () => source.close();
    }, [conversationId, conversation, isRunning]);

    const handleNew = () => {
        createConversation.mutate(undefined, {
            onSuccess: ({ conversation: created }) => router.push(`/testbed/chat/${created.id}`),
            onError: onMutationError,
        });
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text) return;

        // Create a conversation on first send if we are on the index page.
        let targetId = conversationId;
        if (!targetId) {
            try {
                const { conversation: created } = await createConversation.mutateAsync();
                targetId = created.id;
                router.push(`/testbed/chat/${created.id}`);
            } catch (e) {
                fail(e);
                return;
            }
        }

        setInput("");
        setIsRunning(true);
        setStreamingText("");
        setStreamingThinking("");

        // Show it straight away. It is held apart from the cached thread rather
        // than written into it, so a refetch cannot resurrect a stale copy: the
        // moment the server's own message arrives, this list is cleared.
        setPending([optimisticMessage(text, (messages.at(-1)?.seq ?? 0) + 1)]);

        try {
            const res = await fetch(`/api/agent/conversations/${targetId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });

            if (!res.ok || !res.body) {
                throw new Error(`The agent could not be reached (${res.status}).`);
            }

            for await (const event of readAgentStream(res.body)) {
                switch (event.type) {
                    case "text_delta":
                        setStreamingText((prev) => prev + event.text);
                        break;
                    case "thinking_delta":
                        setStreamingThinking((prev) => prev + event.text);
                        break;
                    case "message":
                        // The persisted message replaces both the streaming
                        // buffer and the optimistic copy.
                        setStreamingText("");
                        setStreamingThinking("");
                        setPending([]);
                        await refreshThread();
                        break;
                    case "tool_call":
                    case "tool_result":
                    case "approval_required":
                        await refreshThread();
                        break;
                    case "error":
                        fail(new Error(event.message), "Agent error");
                        break;
                    case "turn_end":
                        setIsRunning(false);
                        break;
                }
            }
        } catch (e) {
            // Nothing reached the server, so hand the text back rather than
            // losing what they typed.
            setInput((current) => current || text);
            fail(e);
        } finally {
            setIsRunning(false);
            setStreamingText("");
            setStreamingThinking("");
            setPending([]);
            await refreshThread();
            await queryClient.invalidateQueries({ queryKey: queryKeys.agent.conversations });
        }
    };

    const handleCancel = () => {
        if (!conversationId) return;
        // Best-effort: the turn may already have finished on its own.
        cancelTurn.mutate(conversationId);
        setIsRunning(false);
    };

    const toggleAutoRun = () => {
        if (!conversation) return;
        updateConversation.mutate({ autoRun: !conversation.autoRun }, { onError: onMutationError });
    };

    const confirmDelete = (target: Conversation) =>
        setDialog({
            isOpen: true,
            title: "Delete conversation",
            message: `Delete "${target.title}"? This cannot be undone.`,
            type: "confirm",
            onConfirm: () => {
                deleteConversation.mutate(target.id, {
                    onSuccess: () => {
                        setDialog(CLOSED);
                        if (target.id === conversationId) router.push("/testbed/chat");
                    },
                    onError: onMutationError,
                });
            },
        });

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4">
                <div className="mb-8">
                    <Navigation />
                    <div className="mt-4 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">
                                {conversation?.title ?? "Chat"}
                            </h2>
                            <p className="text-gray-600 text-sm mt-1">
                                Ask the AI agent about your federated learning experiments.
                            </p>
                        </div>

                        {conversation && (
                            <button
                                onClick={toggleAutoRun}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                                    conversation.autoRun
                                        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                        : "text-gray-600 hover:bg-gray-100"
                                }`}
                                title="When on, the agent runs actions without asking first"
                            >
                                <Zap className="w-4 h-4" />
                                Auto-run {conversation.autoRun ? "on" : "off"}
                            </button>
                        )}
                    </div>
                </div>

                {conversation?.autoRun && (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">
                            Auto-run is on. The agent will start experiments and write files without
                            asking for approval first.
                        </p>
                    </div>
                )}

                <div className="flex gap-6">
                    <ConversationSidebar
                        conversations={conversations}
                        activeId={conversationId}
                        onNew={handleNew}
                        onDelete={confirmDelete}
                        creating={creating}
                    />

                    <div className="flex-1 min-w-0 bg-white rounded-lg shadow flex flex-col max-h-[calc(100vh-14rem)]">
                        <div className="flex-1 overflow-y-auto px-5 py-5">
                            {loading ? (
                                <div className="text-center py-20">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
                                    <p className="mt-4 text-gray-600">Loading conversation...</p>
                                </div>
                            ) : messages.length === 0 && !isRunning ? (
                                <div className="text-center py-16 px-6">
                                    <p className="text-gray-900 font-medium">
                                        Ask about your experiments
                                    </p>
                                    <p className="text-gray-500 text-sm mt-2 max-w-md mx-auto">
                                        The agent can read your runs, compare them, inspect saved
                                        checkpoints and explain what happened. Try &quot;summarise my
                                        last experiment&quot; or &quot;which of my runs converged
                                        fastest?&quot;
                                    </p>
                                </div>
                            ) : (
                                <MessageList
                                    conversationId={conversationId ?? ""}
                                    messages={messages}
                                    toolCalls={toolCalls}
                                    streamingText={streamingText}
                                    streamingThinking={streamingThinking}
                                    isRunning={isRunning}
                                    onDecided={refreshThread}
                                />
                            )}
                            <div ref={bottomRef} />
                        </div>

                        <MessageComposer
                            value={input}
                            onChange={setInput}
                            onSend={handleSend}
                            onCancel={handleCancel}
                            disabled={isRunning}
                            isRunning={isRunning}
                        />
                    </div>
                </div>

                <Footer />
            </div>

            <Dialog
                isOpen={dialog.isOpen}
                onClose={() => setDialog(CLOSED)}
                onConfirm={dialog.onConfirm}
                title={dialog.title}
                message={dialog.message}
                type={dialog.type}
                confirmText={dialog.type === "confirm" ? "Delete" : "OK"}
                isLoading={deleting}
                loadingText="Deleting..."
            />
        </div>
    );
}
