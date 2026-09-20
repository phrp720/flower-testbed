"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiFetch, apiPatch, apiPost, apiPut } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { PublicSettings, TestResult } from "@/app/components/settings/types";
import type { AgentMessage, Conversation, ToolCall } from "@/app/components/chat/types";

/** Queries and mutations for the agent: settings, tokens and conversations. */

export function useAgentSettings() {
    return useQuery({
        queryKey: queryKeys.agent.settings,
        queryFn: () => apiFetch<{ settings: PublicSettings }>("/api/agent/settings"),
        select: (data) => data.settings,
    });
}

export function useSaveAgentSettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: Record<string, unknown>) =>
            apiPut<{ settings: PublicSettings }>("/api/agent/settings", body),
        onSuccess: ({ settings }) => {
            // Write the response straight in: it is the authoritative post-save
            // state, so refetching would only ask the same question twice.
            queryClient.setQueryData(queryKeys.agent.settings, { settings });
        },
    });
}

export function useTestConnection() {
    return useMutation({
        mutationFn: () => apiPost<TestResult>("/api/agent/settings/test"),
    });
}

export type ApiToken = {
    id: string;
    name: string;
    prefix: string;
    scopes: "read" | "write";
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
};

export function useApiTokens() {
    return useQuery({
        queryKey: queryKeys.agent.tokens,
        queryFn: () => apiFetch<{ tokens: ApiToken[] }>("/api/agent/tokens"),
        select: (data) => data.tokens,
    });
}

export function useCreateApiToken() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: { name: string; scopes: string }) =>
            apiPost<{ token: string; record: ApiToken }>("/api/agent/tokens", body),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.agent.tokens });
        },
    });
}

export function useRevokeApiToken() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/agent/tokens/${id}`),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.agent.tokens });
        },
    });
}

export function useConversations() {
    return useQuery({
        queryKey: queryKeys.agent.conversations,
        queryFn: () => apiFetch<{ conversations: Conversation[] }>("/api/agent/conversations"),
        select: (data) => data.conversations,
    });
}

export type Thread = {
    conversation: Conversation;
    messages: AgentMessage[];
    toolCalls: ToolCall[];
    pendingToolCallIds: string[];
};

export function useThread(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.agent.thread(id ?? ""),
        queryFn: () => apiFetch<Thread>(`/api/agent/conversations/${id}`),
        enabled: Boolean(id),
        /**
         * Poll while the conversation is mid-turn.
         *
         * The stream is the fast path, not the only one. A turn resumed after an
         * approval runs detached from any request, and its events can land while
         * the client happens to have no subscription -- between an EventSource
         * teardown and its reopen, most reliably right after a decision. The
         * reply was written to the database and simply never fetched, so it
         * appeared only when the next message forced a refetch.
         *
         * Polling makes the transcript converge whatever the stream missed, and
         * stops the moment the turn does.
         */
        refetchInterval: (query) => {
            const status = query.state.data?.conversation?.status;
            return status === "running" || status === "awaiting_approval" ? 2000 : false;
        },
    });
}

export function useCreateConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () =>
            apiPost<{ conversation: Conversation }>("/api/agent/conversations", {}),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.agent.conversations });
        },
    });
}

export function useCancelTurn() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            apiPost<{ cancelled: boolean }>(`/api/agent/conversations/${id}/cancel`),
        onSettled: (_result, _error, id) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.agent.thread(id) });
        },
    });
}

export function useDeleteConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            apiDelete<{ success: boolean }>(`/api/agent/conversations/${id}`),
        onSuccess: (_result, id) => {
            queryClient.removeQueries({ queryKey: queryKeys.agent.thread(id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.agent.conversations });
        },
    });
}

export type Attachment = {
    id: string;
    filename: string;
    relativePath: string;
    sizeBytes: number;
};

/**
 * Upload a file the user attached to the composer.
 *
 * Sent as multipart rather than through apiPost, which serialises JSON: a
 * FormData body must set its own boundary, so a Content-Type header here would
 * break it.
 */
export function useUploadAttachment() {
    return useMutation({
        mutationFn: async ({ file, conversationId }: { file: File; conversationId?: string }) => {
            const body = new FormData();
            body.append("file", file);
            if (conversationId) body.append("conversationId", conversationId);

            const response = await fetch("/api/agent/uploads", { method: "POST", body });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(payload.error ?? `Upload failed (${response.status})`);
            }
            return payload.attachment as Attachment;
        },
    });
}

export function useUpdateConversation(id: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (patch: { title?: string; autoRun?: boolean }) =>
            apiPatch<{ conversation: Conversation }>(`/api/agent/conversations/${id}`, patch),
        onSuccess: ({ conversation }) => {
            queryClient.setQueryData(queryKeys.agent.thread(id), (previous: Thread | undefined) =>
                previous ? { ...previous, conversation } : previous
            );
            void queryClient.invalidateQueries({ queryKey: queryKeys.agent.conversations });
        },
    });
}

/**
 * Approve or decline a pending action.
 *
 * The conversation id comes from the caller rather than the response, because
 * the thread has to be invalidated even when the server reports the call was
 * already decided elsewhere.
 */
export function useDecideAction(conversationId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            decision,
            approveAll,
        }: {
            id: string;
            decision: "approve" | "reject";
            /** Also grant the rest of this conversation. */
            approveAll?: boolean;
        }) =>
            apiPost<{ toolCall: ToolCall; resumed?: boolean }>(`/api/agent/actions/${id}`, {
                decision,
                ...(approveAll ? { approveAll: true } : {}),
            }),
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.agent.thread(conversationId),
            });
        },
    });
}
