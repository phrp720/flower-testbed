export type LlmBlock =
    | { type: "text"; text: string }
    | { type: "thinking"; text: string; signature?: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export type Conversation = {
    id: string;
    title: string;
    autoRun: boolean;
    status: "idle" | "running" | "awaiting_approval" | "error";
    experimentId: string | null;
    errorMessage: string | null;
    inputTokens: number;
    outputTokens: number;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string | null;
};

export type AgentMessage = {
    id: string;
    seq: number;
    role: "user" | "assistant" | "system";
    kind: "chat" | "tool_results" | "system_note";
    content: LlmBlock[];
    stopReason: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    errorMessage: string | null;
    createdAt: string;
};

export type ToolCall = {
    id: string;
    messageId: string | null;
    toolUseId: string;
    toolName: string;
    input: unknown;
    riskLevel: "read" | "write" | "execute";
    requiresApproval: boolean;
    status: "pending" | "approved" | "rejected" | "running" | "succeeded" | "failed";
    previewSummary: string | null;
    previewDiff: string | null;
    resultContent: { text?: string } | null;
    isError: boolean;
    durationMs: number | null;
};

export const RISK_LABELS: Record<string, string> = {
    read: "reads data",
    write: "changes data",
    execute: "runs a job",
};
