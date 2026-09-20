"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button, Callout, Card, EmptyState, Spinner } from "@/app/components/ui";
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
    useUploadAttachment,
    type Attachment,
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
/**
 * A message waiting for the conversation route to mount.
 *
 * Sending from the index page has to create a conversation and navigate to it,
 * and that navigation swaps one route segment for another -- so the component
 * that started the turn is unmounted while its stream is still arriving, and
 * every state update it makes lands on nothing. The reply only reappeared after
 * a refresh, because nothing told the fresh mount a turn was in flight.
 *
 * Module scope rather than state for exactly that reason: it has to outlive the
 * component. Claimed once, by the mount that matches its id.
 */
let pendingHandoff: {
    conversationId: string;
    text: string;
    attachments: Attachment[];
} | null = null;

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

    // Attachments are uploaded as soon as they are picked, so the file is on
    // disk before the turn starts and the message only has to name it.
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const uploadAttachment = useUploadAttachment();

    const handleAttach = (files: FileList) => {
        for (const file of Array.from(files)) {
            uploadAttachment.mutate(
                { file, conversationId: conversationId ?? undefined },
                {
                    onSuccess: (attachment) =>
                        setAttachments((current) => [...current, attachment]),
                    onError: (error) => fail(error, "Could not attach that file"),
                }
            );
        }
    };

    const paneRef = useRef<HTMLDivElement>(null);
    /**
     * Whether the reader is parked at the bottom.
     *
     * Updated only by actual scrolling, so arriving content never flips it --
     * someone who has scrolled up to re-read an earlier answer keeps their
     * place instead of being yanked back down.
     */
    const stickToBottom = useRef(true);

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

    /**
     * What a scroll should actually follow.
     *
     * The previous dependency was the `messages` array, which is rebuilt on
     * every render and so compared unequal every time -- meaning the pane
     * scrolled itself on any state change at all, including toggling auto-run
     * or typing. These are values, so they only change when the transcript does.
     */
    const lastMessageId = messages.at(-1)?.id ?? "";
    const toolSignal = toolCalls.map((call) => `${call.id}:${call.status}`).join(",");

    useEffect(() => {
        const pane = paneRef.current;
        if (!pane || !stickToBottom.current) return;
        // Scrolling the pane directly rather than scrollIntoView on a sentinel:
        // scrollIntoView walks up and moves scrollable ancestors too, which is
        // what dragged the whole page down.
        pane.scrollTo({
            top: pane.scrollHeight,
            // Smooth animation restarts on every token while streaming, which
            // reads as lag; a jump is what a live transcript wants.
            behavior: isRunning ? "auto" : "smooth",
        });
    }, [messages.length, lastMessageId, streamingText, toolSignal, isRunning]);

    // A different conversation starts at its end, wherever the last one was left.
    useEffect(() => {
        stickToBottom.current = true;
    }, [conversationId]);

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

    /** Post a message and consume its stream. Assumes the conversation exists. */
    const send = async (targetId: string, text: string, files: Attachment[] = []) => {
        setInput("");
        setAttachments([]);
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
                body: JSON.stringify({ text, attachments: files }),
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

    const handleSend = async () => {
        const text = input.trim();
        if (!text && attachments.length === 0) return;

        if (conversationId) {
            void send(conversationId, text, attachments);
            return;
        }

        // No conversation yet: make one, hand the text to the route that is
        // about to mount, and let it own the turn from the start.
        try {
            const { conversation: created } = await createConversation.mutateAsync();
            pendingHandoff = { conversationId: created.id, text, attachments };
            setInput("");
            setAttachments([]);
            router.push(`/testbed/chat/${created.id}`);
        } catch (e) {
            fail(e);
        }
    };

    // Claimed by the mount it was addressed to, exactly once.
    useEffect(() => {
        if (!conversationId || pendingHandoff?.conversationId !== conversationId) return;
        const { text, attachments: files } = pendingHandoff;
        pendingHandoff = null;
        void send(conversationId, text, files);
        // `send` is recreated every render; re-running on that would send twice.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]);

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
        <>
            <div className="flex items-start justify-between gap-4 mb-5">
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold text-ink truncate">
                        {conversation?.title ?? "Chat"}
                    </h1>
                    <p className="text-sm text-ink-muted mt-0.5">
                        Ask the agent about your federated learning experiments.
                    </p>
                </div>

                {conversation && (
                    <Button
                        size="sm"
                        icon="energy"
                        onClick={toggleAutoRun}
                        title="When on, the agent runs actions without asking first"
                        className={
                            conversation.autoRun
                                ? "border-warn-line bg-warn-surface text-warn hover:bg-warn-surface"
                                : undefined
                        }
                    >
                        Auto-run {conversation.autoRun ? "on" : "off"}
                    </Button>
                )}
            </div>

            {conversation?.autoRun && (
                <Callout tone="warn" className="mb-4">
                    The agent will start experiments and write files without asking for approval
                    first.
                </Callout>
            )}

            {/* Fixed height rather than page scroll: a conversation reads as a
                pane with its own scrollback, and the composer must stay put. */}
            <Card padded={false} className="flex h-[calc(100vh-15rem)] min-h-[28rem] overflow-hidden">
                <ConversationSidebar
                    conversations={conversations}
                    activeId={conversationId}
                    onNew={handleNew}
                    onDelete={confirmDelete}
                    creating={creating}
                />

                <div className="flex-1 min-w-0 flex flex-col">
                    <div
                        ref={paneRef}
                        onScroll={() => {
                            const pane = paneRef.current;
                            if (!pane) return;
                            const fromBottom =
                                pane.scrollHeight - pane.scrollTop - pane.clientHeight;
                            stickToBottom.current = fromBottom < 120;
                        }}
                        className="flex-1 overflow-y-auto px-5 py-5"
                    >
                        {loading ? (
                            <div className="flex justify-center py-20">
                                <Spinner size={16} label="Loading conversation" />
                            </div>
                        ) : messages.length === 0 && !isRunning ? (
                            <EmptyState
                                icon="sparkle"
                                title="Ask about your experiments"
                                description={
                                    'The agent can read your runs, compare them, inspect saved ' +
                                    'checkpoints and explain what happened. Try "summarise my last ' +
                                    'experiment" or "which of my runs converged fastest?"'
                                }
                                className="py-16"
                            />
                        ) : (
                            <MessageList
                                conversationId={conversationId ?? ""}
                                messages={messages}
                                toolCalls={toolCalls}
                                streamingText={streamingText}
                                streamingThinking={streamingThinking}
                                isRunning={isRunning}
                                status={conversation?.status}
                                onDecided={refreshThread}
                            />
                        )}
                    </div>

                    <MessageComposer
                        value={input}
                        onChange={setInput}
                        onSend={handleSend}
                        onCancel={handleCancel}
                        disabled={isRunning}
                        isRunning={isRunning}
                        attachments={attachments}
                        uploading={uploadAttachment.isPending}
                        onAttach={handleAttach}
                        onRemoveAttachment={(id) =>
                            setAttachments((current) => current.filter((a) => a.id !== id))
                        }
                    />
                </div>
            </Card>

            <Dialog
                isOpen={dialog.isOpen}
                onClose={() => setDialog(CLOSED)}
                onConfirm={dialog.onConfirm}
                title={dialog.title}
                message={dialog.message}
                type={dialog.type}
                confirmText={dialog.type === "confirm" ? "Delete" : "OK"}
                isLoading={deleting}
                loadingText="Deleting"
            />
        </>
    );
}
