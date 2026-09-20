"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User } from "lucide-react";
import ToolCallCard from "./ToolCallCard";
import ThinkingBlock from "./ThinkingBlock";
import ActionApprovalCard from "./ActionApprovalCard";
import ExperimentWidget from "./ExperimentWidget";
import type { AgentMessage, ToolCall } from "./types";

type Props = {
    conversationId: string;
    messages: AgentMessage[];
    toolCalls: ToolCall[];
    streamingText: string;
    streamingThinking: string;
    isRunning: boolean;
    onDecided: () => void;
};

function Markdown({ children }: { children: string }) {
    return (
        <div className="text-sm text-gray-800 leading-relaxed space-y-3">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
                    strong: ({ children }) => (
                        <strong className="font-semibold text-gray-900">{children}</strong>
                    ),
                    a: ({ href, children }) => (
                        <a href={href} className="text-blue-600 hover:underline">
                            {children}
                        </a>
                    ),
                    code: ({ className, children }) => {
                        // Fenced blocks carry a language class; inline code does not.
                        const isBlock = typeof className === "string" && className.includes("language-");
                        return isBlock ? (
                            <code className="block">{children}</code>
                        ) : (
                            <code className="bg-gray-100 text-gray-900 px-1.5 py-0.5 rounded text-xs font-mono">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => (
                        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                            {children}
                        </pre>
                    ),
                    table: ({ children }) => (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-xs border border-gray-200 rounded">
                                {children}
                            </table>
                        </div>
                    ),
                    th: ({ children }) => (
                        <th className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-left font-medium">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="border-b border-gray-100 px-3 py-1.5">{children}</td>
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/**
 * Experiment ids a tool call touched, so the conversation can show the run
 * itself rather than just a line of JSON about it.
 */
function experimentIdsFrom(calls: ToolCall[]): string[] {
    const interesting = new Set([
        "create_experiment",
        "clone_experiment",
        "start_experiment",
        "stop_experiment",
        "get_experiment_status",
        "wait_for_round",
        "summarize_experiment",
    ]);

    const ids = new Set<string>();
    for (const call of calls) {
        if (!interesting.has(call.toolName)) continue;
        if (call.status !== "succeeded") continue;

        const fromInput = (call.input as { experimentId?: string } | null)?.experimentId;
        if (typeof fromInput === "string" && UUID_PATTERN.test(fromInput)) ids.add(fromInput);

        // create/clone return a fresh id rather than receiving one.
        const match = call.resultContent?.text?.match(UUID_PATTERN);
        if (match) ids.add(match[0]);
    }
    return [...ids];
}

function Avatar({ role }: { role: string }) {
    const isUser = role === "user";
    return (
        <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isUser ? "bg-gray-200 text-gray-700" : "bg-gray-800 text-white"
            }`}
        >
            {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>
    );
}

export default function MessageList({
    conversationId,
    messages,
    toolCalls,
    streamingText,
    streamingThinking,
    isRunning,
    onDecided,
}: Props) {
    const callsByMessage = new Map<string, ToolCall[]>();
    for (const call of toolCalls) {
        if (!call.messageId) continue;
        const list = callsByMessage.get(call.messageId) ?? [];
        list.push(call);
        callsByMessage.set(call.messageId, list);
    }

    return (
        <div className="space-y-5">
            {messages.map((message) => {
                // Tool results are rendered on the call they belong to, not as a
                // separate turn -- the wire role says "user", but a human did not
                // write them.
                if (message.kind === "tool_results") return null;

                const calls = callsByMessage.get(message.id) ?? [];
                const thinking = message.content
                    .filter((b) => b.type === "thinking")
                    .map((b) => (b.type === "thinking" ? b.text : ""))
                    .join("\n");
                const text = message.content
                    .filter((b) => b.type === "text")
                    .map((b) => (b.type === "text" ? b.text : ""))
                    .join("\n");

                return (
                    <div key={message.id} className="flex gap-3">
                        <Avatar role={message.role} />
                        <div className="min-w-0 flex-1">
                            {thinking && <ThinkingBlock text={thinking} />}
                            {text && <Markdown>{text}</Markdown>}

                            {calls.map((call) =>
                                call.status === "pending" ? (
                                    <ActionApprovalCard
                                        key={call.id}
                                        toolCall={call}
                                        conversationId={conversationId}
                                        onDecided={onDecided}
                                    />
                                ) : (
                                    <ToolCallCard key={call.id} toolCall={call} />
                                )
                            )}

                            {experimentIdsFrom(calls).map((id) => (
                                <ExperimentWidget key={id} experimentId={id} />
                            ))}

                            {message.errorMessage && (
                                <p className="text-sm text-red-600 mt-2">{message.errorMessage}</p>
                            )}
                        </div>
                    </div>
                );
            })}

            {isRunning && (streamingText || streamingThinking) && (
                <div className="flex gap-3">
                    <Avatar role="assistant" />
                    <div className="min-w-0 flex-1">
                        {streamingThinking && <ThinkingBlock text={streamingThinking} streaming />}
                        {streamingText && <Markdown>{streamingText}</Markdown>}
                    </div>
                </div>
            )}

            {isRunning && !streamingText && !streamingThinking && (
                <div className="flex gap-3">
                    <Avatar role="assistant" />
                    <div className="flex items-center gap-1.5 h-7">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                        <span
                            className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"
                            style={{ animationDelay: "150ms" }}
                        />
                        <span
                            className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"
                            style={{ animationDelay: "300ms" }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
