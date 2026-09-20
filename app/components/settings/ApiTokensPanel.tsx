"use client";

import { useState } from "react";
import Dialog from "@/app/components/Dialog";
import {
    Badge,
    Button,
    Callout,
    Card,
    CardHeader,
    CopyButton,
    EmptyState,
    Icon,
    Input,
    Select,
    Spinner,
} from "@/app/components/ui";
import {
    useApiTokens,
    useCreateApiToken,
    useRevokeApiToken,
    type ApiToken,
} from "@/app/hooks/useAgent";

/** A command the reader is meant to copy verbatim. */
function Command({ children }: { children: React.ReactNode }) {
    return (
        <code className="block bg-surface border border-line rounded-[var(--radius)] px-3 py-2 text-[11px] font-mono break-all text-ink">
            {children}
        </code>
    );
}

export default function ApiTokensPanel() {
    const { data: tokens = [], isLoading } = useApiTokens();
    const createToken = useCreateApiToken();
    const revokeToken = useRevokeApiToken();

    const [name, setName] = useState("");
    const [scopes, setScopes] = useState<"read" | "write">("read");

    // Shown exactly once: only the sha256 digest is stored, so it cannot be
    // recovered afterwards by us or by anyone else.
    const [issued, setIssued] = useState<string | null>(null);
    const [confirmRevoke, setConfirmRevoke] = useState<ApiToken | null>(null);
    const [error, setError] = useState<string | null>(null);

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const handleCreate = () => {
        setError(null);
        createToken.mutate(
            { name, scopes },
            {
                onSuccess: (data) => {
                    setIssued(data.token);
                    setName("");
                },
                onError: (e) =>
                    setError(e instanceof Error ? e.message : "Failed to create token"),
            }
        );
    };

    const handleRevoke = () => {
        if (!confirmRevoke) return;
        revokeToken.mutate(confirmRevoke.id, {
            onSuccess: () => setConfirmRevoke(null),
            onError: (e) =>
                setError(e instanceof Error ? e.message : "Failed to revoke token"),
        });
    };

    return (
        <Card>
            <CardHeader
                title="MCP access"
                description="External assistants such as Claude Desktop or Claude Code cannot use your browser session, so they authenticate with a token."
                className="mb-5"
            />

            {error && (
                <Callout tone="danger" className="mb-4">
                    {error}
                </Callout>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
                <Input
                    label="Token name"
                    placeholder="claude-desktop"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    wrapperClassName="flex-1"
                />
                <Select
                    label="Access"
                    value={scopes}
                    onChange={(e) => setScopes(e.target.value as "read" | "write")}
                    wrapperClassName="sm:w-44"
                    hint="A read-only token never has the mutating tools registered at all."
                >
                    <option value="read">Read only</option>
                    <option value="write">Read and write</option>
                </Select>
                <Button
                    variant="primary"
                    icon="add"
                    onClick={handleCreate}
                    loading={createToken.isPending}
                    disabled={!name.trim()}
                    className="sm:mt-[1.375rem]"
                >
                    Create
                </Button>
            </div>

            {issued && (
                <Callout tone="ok" title="Copy this token now — it is not shown again" className="mt-5">
                    <div className="flex items-center gap-2 mt-2">
                        <Command>{issued}</Command>
                        <CopyButton
                            value={issued}
                            label="Copy"
                            variant="secondary"
                            title="Copy token"
                            className="shrink-0"
                        />
                    </div>

                    <p className="mt-4 mb-1.5 text-xs font-medium text-ink">Connect Claude Code</p>
                    <Command>
                        claude mcp add flower-testbed --transport http {origin}/api/mcp --header
                        &quot;Authorization: Bearer {issued}&quot;
                    </Command>

                    <p className="mt-3 mb-1.5 text-xs font-medium text-ink">
                        For a host that cannot send headers
                    </p>
                    <Command>
                        FLOWER_MCP_TOKEN={issued} node scripts/mcp-stdio-bridge.mjs
                    </Command>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIssued(null)}
                        className="mt-3 -ml-2.5"
                    >
                        Done
                    </Button>
                </Callout>
            )}

            <div className="mt-5 border-t border-line">
                {isLoading ? (
                    <div className="py-6 flex justify-center">
                        <Spinner size={14} label="Loading tokens" />
                    </div>
                ) : tokens.length === 0 ? (
                    <EmptyState
                        icon="token"
                        title="No tokens yet"
                        description="Create one above to connect an external MCP client."
                        className="py-8"
                    />
                ) : (
                    <ul className="divide-y divide-line">
                        {tokens.map((token) => (
                            <li key={token.id} className="flex items-center gap-3 py-3">
                                <Icon name="token" size={15} className="text-ink-subtle shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-ink truncate">
                                            {token.name}
                                        </span>
                                        <Badge tone={token.scopes === "write" ? "warn" : "neutral"}>
                                            {token.scopes === "write" ? "read + write" : "read only"}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-ink-subtle mt-0.5">
                                        <span className="font-mono">{token.prefix}…</span>
                                        {" · "}
                                        {token.lastUsedAt
                                            ? `last used ${new Date(token.lastUsedAt).toLocaleString()}`
                                            : "never used"}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    icon="delete"
                                    onClick={() => setConfirmRevoke(token)}
                                    className="shrink-0 hover:text-danger hover:bg-danger-surface"
                                >
                                    Revoke
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Dialog
                isOpen={confirmRevoke !== null}
                onClose={() => setConfirmRevoke(null)}
                onConfirm={handleRevoke}
                title="Revoke token"
                message={`Revoke "${confirmRevoke?.name}"? Any assistant using it loses access immediately.`}
                type="confirm"
                confirmText="Revoke"
                isLoading={revokeToken.isPending}
                loadingText="Revoking"
            />
        </Card>
    );
}
