"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import Dialog from "@/app/components/Dialog";
import { HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from "./types";
import {
    useApiTokens,
    useCreateApiToken,
    useRevokeApiToken,
    type ApiToken,
} from "@/app/hooks/useAgent";

export default function ApiTokensPanel() {
    const { data: tokens = [], isLoading: loading } = useApiTokens();
    const createToken = useCreateApiToken();
    const revokeToken = useRevokeApiToken();

    const creating = createToken.isPending;
    const revoking = revokeToken.isPending;

    const [name, setName] = useState("");
    const [scopes, setScopes] = useState<"read" | "write">("read");

    // Shown exactly once: only the sha256 digest is stored, so it cannot be recovered.
    const [newToken, setNewToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [confirmRevoke, setConfirmRevoke] = useState<ApiToken | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = () => {
        setError(null);
        createToken.mutate(
            { name, scopes },
            {
                onSuccess: (data) => {
                    setNewToken(data.token);
                    setName("");
                },
                onError: (e) => setError(e instanceof Error ? e.message : "Failed to create token"),
            }
        );
    };

    const handleRevoke = () => {
        if (!confirmRevoke) return;
        revokeToken.mutate(confirmRevoke.id, {
            onSuccess: () => setConfirmRevoke(null),
            onError: (e) => setError(e instanceof Error ? e.message : "Failed to revoke token"),
        });
    };

    const copy = async (value: string) => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900">MCP access</h3>
            <p className="text-gray-600 text-sm mt-1 mb-6">
                This testbed exposes its experiments over the Model Context Protocol, so an
                external assistant such as Claude Desktop or Claude Code can read them directly.
                Those clients cannot use your browser session, so they authenticate with a token.
            </p>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-6">
                <div className="flex-1">
                    <label className={LABEL_CLASS} htmlFor="tokenName">
                        Token name
                    </label>
                    <input
                        id="tokenName"
                        className={INPUT_CLASS}
                        placeholder="e.g. claude-desktop"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div className="sm:w-44">
                    <label className={LABEL_CLASS} htmlFor="tokenScope">
                        Access
                    </label>
                    <select
                        id="tokenScope"
                        className={INPUT_CLASS}
                        value={scopes}
                        onChange={(e) => setScopes(e.target.value as "read" | "write")}
                    >
                        <option value="read">Read only</option>
                        <option value="write">Read and write</option>
                    </select>
                </div>
                <button
                    onClick={handleCreate}
                    disabled={creating || !name.trim()}
                    className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create
                </button>
            </div>

            <p className={`${HINT_CLASS} -mt-4 mb-6`}>
                A read-only token never has the experiment-modifying tools registered at all, so
                an assistant holding one cannot start, change or delete anything.
            </p>

            {loading ? (
                <p className="text-sm text-gray-500">Loading tokens...</p>
            ) : tokens.length === 0 ? (
                <p className="text-sm text-gray-500">No tokens yet.</p>
            ) : (
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                    {tokens.map((token) => (
                        <div key={token.id} className="flex items-center justify-between gap-4 py-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <KeyRound className="w-4 h-4 text-gray-400 shrink-0" />
                                    <span className="font-medium text-gray-900 truncate">{token.name}</span>
                                    <span
                                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            token.scopes === "write"
                                                ? "bg-amber-100 text-amber-800"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        {token.scopes === "write" ? "read + write" : "read only"}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 font-mono">
                                    {token.prefix}…
                                    <span className="font-sans ml-2">
                                        {token.lastUsedAt
                                            ? `last used ${new Date(token.lastUsedAt).toLocaleString()}`
                                            : "never used"}
                                    </span>
                                </p>
                            </div>
                            <button
                                onClick={() => setConfirmRevoke(token)}
                                className="flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                            >
                                <Trash2 className="w-4 h-4" />
                                Revoke
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {newToken && (
                <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-sm font-medium text-green-900">
                        Copy this token now — it is not shown again.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                        <code className="flex-1 bg-white border border-green-200 rounded px-3 py-2 text-xs font-mono break-all">
                            {newToken}
                        </code>
                        <button
                            onClick={() => copy(newToken)}
                            className="flex items-center gap-1.5 bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-green-800 transition-colors shrink-0"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>

                    <p className="mt-4 text-xs font-medium text-green-900">Connect Claude Code:</p>
                    <code className="mt-1.5 block bg-white border border-green-200 rounded px-3 py-2 text-xs font-mono break-all">
                        claude mcp add flower-testbed --transport http{" "}
                        {typeof window !== "undefined" ? window.location.origin : ""}/api/mcp --header
                        &quot;Authorization: Bearer {newToken}&quot;
                    </code>

                    <p className="mt-3 text-xs font-medium text-green-900">
                        For a host that cannot send headers, use the stdio bridge:
                    </p>
                    <code className="mt-1.5 block bg-white border border-green-200 rounded px-3 py-2 text-xs font-mono break-all">
                        FLOWER_MCP_TOKEN={newToken} node scripts/mcp-stdio-bridge.mjs
                    </code>

                    <button
                        onClick={() => setNewToken(null)}
                        className="mt-4 text-xs text-green-800 hover:text-green-900 underline"
                    >
                        Done
                    </button>
                </div>
            )}

            <Dialog
                isOpen={confirmRevoke !== null}
                onClose={() => setConfirmRevoke(null)}
                onConfirm={handleRevoke}
                title="Revoke token"
                message={`Revoke "${confirmRevoke?.name}"? Any assistant using it will lose access immediately.`}
                type="confirm"
                confirmText="Revoke"
                isLoading={revoking}
                loadingText="Revoking..."
            />
        </div>
    );
}
