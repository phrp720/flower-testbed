"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/app/components/ui";
import ToolCallCard from "./ToolCallCard";
import ThinkingBlock from "./ThinkingBlock";
import ActionApprovalCard from "./ActionApprovalCard";
import ExperimentWidget from "./ExperimentWidget";
import ModelViewWidget from "./ModelViewWidget";
import AgentStatus from "./AgentStatus";
import { Button, Callout, CopyButton } from "@/app/components/ui";
import type { AgentMessage, ToolCall } from "./types";

type Props = {
    conversationId: string;
    messages: AgentMessage[];
    toolCalls: ToolCall[];
    streamingText: string;
    streamingThinking: string;
    isRunning: boolean;
    /** The conversation's own status, so a failed turn leaves a visible trace. */
    status?: string;
    /** Why it failed, straight from the provider. */
    errorMessage?: string | null;
    onDecided: () => void;
    /** Run the failed turn again, without retyping anything. */
    onRetry?: () => void;
};

function Markdown({ children }: { children: string }) {
    return (
        <div className="text-sm text-ink leading-relaxed space-y-3">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
                    strong: ({ children }) => (
                        <strong className="font-semibold text-ink">{children}</strong>
                    ),
                    a: ({ href, children }) => (
                        <a href={href} className="text-info hover:underline">
                            {children}
                        </a>
                    ),
                    /**
                     * Dropped, never rendered.
                     *
                     * The agent cannot see images and has nowhere to host one,
                     * so a markdown image here is always a guess at a URL that
                     * does not exist -- and a broken-image glyph beside a
                     * perfectly good explanation reads as the feature failing.
                     * The real picture is drawn by ModelViewWidget.
                     */
                    img: () => null,
                    code: ({ className, children }) => {
                        // Fenced blocks carry a language class; inline code does not.
                        const isBlock = typeof className === "string" && className.includes("language-");
                        return isBlock ? (
                            <code className="block">{children}</code>
                        ) : (
                            <code className="bg-surface-muted text-ink px-1.5 py-0.5 rounded text-xs font-mono">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => (
                        <pre className="bg-ink text-ink-inverted rounded-[var(--radius)] p-3.5 text-xs font-mono overflow-x-auto">
                            {children}
                        </pre>
                    ),
                    table: ({ children }) => (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-xs border border-line rounded-[var(--radius)]">
                                {children}
                            </table>
                        </div>
                    ),
                    th: ({ children }) => (
                        <th className="border-b border-line bg-surface-muted px-3 py-1.5 text-left font-medium">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="border-b border-line px-3 py-1.5">{children}</td>
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
 * Experiments whose model view was asked about, so the transcript can show the
 * picture the agent could only describe.
 */
function modelViewIdsFrom(calls: ToolCall[]): string[] {
    const ids = new Set<string>();
    for (const call of calls) {
        if (call.toolName !== "describe_model_view") continue;
        if (call.status !== "succeeded") continue;

        const id = (call.input as { experimentId?: string } | null)?.experimentId;
        if (typeof id === "string" && UUID_PATTERN.test(id)) ids.add(id);
    }
    return [...ids];
}

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

/**
 * The agent's marker.
 *
 * Only the agent gets one: a right-aligned filled bubble already says who wrote
 * it, and a second avatar on that side would be redundant chrome.
 */
function AgentAvatar() {
    return (
        <span className="w-6 h-6 rounded-[var(--radius)] flex items-center justify-center shrink-0 bg-accent text-ink-inverted">
            <Icon name="agent" size={13} />
        </span>
    );
}

/**
 * What the agent is currently doing, in words.
 *
 * Derived from state that already exists rather than tracked separately, so it
 * cannot disagree with what the transcript shows.
 */
function currentActivity(toolCalls: ToolCall[], thinking: string, text: string): string {
    const running = toolCalls.find((call) => call.status === "running");
    if (running) return `Running ${running.toolName}`;
    if (text) return "Writing";
    if (thinking) return "Thinking";
    return "Working";
}

export default function MessageList({
    conversationId,
    messages,
    toolCalls,
    streamingText,
    streamingThinking,
    isRunning,
    status,
    errorMessage,
    onDecided,
    onRetry,
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

                // What the person typed, on the right, in a filled bubble.
                // Rendered as plain text rather than markdown: people type
                // sentences, and markdown styling inside an inverted bubble
                // fights the fill for contrast.
                if (message.role === "user") {
                    if (!text) return null;
                    return (
                        <div key={message.id} className="group flex flex-col items-end">
                            <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent text-ink-inverted px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {text}
                            </div>
                            {/* Revealed on hover so a transcript is not a column
                                of buttons, but always present below sm: a
                                pointer is the only thing that can hover. */}
                            <div className="mt-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                                <CopyButton value={text} title="Copy message" />
                            </div>
                        </div>
                    );
                }

                return (
                    <div key={message.id} className="group flex gap-3">
                        <AgentAvatar />
                        <div className="min-w-0 flex-1">
                            {thinking && <ThinkingBlock text={thinking} />}
                            {text && <Markdown>{text}</Markdown>}
                            {text && (
                                <div className="mt-1 -ml-2.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                                    {/* The markdown source, not the rendered
                                        text: pasting a table as prose loses it. */}
                                    <CopyButton value={text} title="Copy reply" />
                                </div>
                            )}

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

                            {modelViewIdsFrom(calls).map((id) => (
                                <ModelViewWidget key={`view-${id}`} experimentId={id} />
                            ))}

                            {message.errorMessage && (
                                <p className="text-sm text-danger mt-2">{message.errorMessage}</p>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* One agent block for the whole live turn: whatever has streamed
                so far, with the status line underneath it. Keeping them
                together means the indicator never sits above text that has
                already arrived. */}
            {isRunning && (
                <div className="flex gap-3">
                    <AgentAvatar />
                    <div className="min-w-0 flex-1">
                        {streamingThinking && <ThinkingBlock text={streamingThinking} streaming />}
                        {streamingText && <Markdown>{streamingText}</Markdown>}
                        <AgentStatus
                            label={currentActivity(toolCalls, streamingThinking, streamingText)}
                        />
                    </div>
                </div>
            )}

            {/* A turn that died mid-flight only raised a dialog at the time, so
                coming back to the conversation showed a question with no answer
                and no reason. The status outlives the dialog. */}
            {!isRunning && status === "error" && messages.length > 0 && (
                <Callout
                    tone="danger"
                    title="The agent did not reply"
                    actions={
                        onRetry && (
                            <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
                                Retry
                            </Button>
                        )
                    }
                >
                    {/* The provider's own words first. "Check your settings" is
                        useless advice when the real answer is a rate limit or a
                        model name the endpoint does not know. */}
                    {errorMessage ? (
                        <span className="font-mono text-xs break-words">{errorMessage}</span>
                    ) : (
                        <>
                            The last turn failed. Check that a model and API key are set in{" "}
                            <a href="/testbed/settings" className="underline underline-offset-2">
                                Settings
                            </a>
                            .
                        </>
                    )}
                </Callout>
            )}
        </div>
    );
}
