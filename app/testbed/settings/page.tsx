"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Plug, Save } from "lucide-react";
import Navigation from "@/app/components/Navigation";
import Footer from "@/app/components/Footer";
import Dialog from "@/app/components/Dialog";
import ProviderForm from "@/app/components/settings/ProviderForm";
import EmbeddingForm from "@/app/components/settings/EmbeddingForm";
import ApiTokensPanel from "@/app/components/settings/ApiTokensPanel";
import type { PublicSettings } from "@/app/components/settings/types";
import { useAgentSettings, useSaveAgentSettings, useTestConnection } from "@/app/hooks/useAgent";

type DialogState = {
    isOpen: boolean;
    title: string;
    message: string;
    type: "info" | "error" | "success" | "warning";
};

const CLOSED_DIALOG: DialogState = { isOpen: false, title: "", message: "", type: "info" };

export default function SettingsPage() {
    const { data: serverSettings, isLoading: loading, error: loadError } = useAgentSettings();
    const saveSettings = useSaveAgentSettings();
    const testConnection = useTestConnection();

    const saving = saveSettings.isPending;
    const testing = testConnection.isPending;

    // Local edits layered over the server copy, so the form stays responsive
    // while the cache remains the source of truth for what is actually stored.
    const [draft, setDraft] = useState<Partial<PublicSettings>>({});
    const [dirty, setDirty] = useState(false);
    const settings: PublicSettings | null = serverSettings
        ? { ...serverSettings, ...draft }
        : null;

    // Held apart from `settings` so the key is only ever sent, never received.
    const [apiKey, setApiKey] = useState("");
    const [embeddingApiKey, setEmbeddingApiKey] = useState("");
    const [showApiKey, setShowApiKey] = useState(false);
    const [clearApiKey, setClearApiKey] = useState(false);

    const [dialog, setDialog] = useState<DialogState>(CLOSED_DIALOG);

    const patch = (update: Partial<PublicSettings>) => {
        setDraft((prev) => ({ ...prev, ...update }));
        setDirty(true);
    };

    const handleSave = async () => {
        if (!settings) return;

        try {
            const body: Record<string, unknown> = {
                provider: settings.provider,
                baseUrl: settings.baseUrl,
                model: settings.model,
                maxTokens: settings.maxTokens,
                effort: settings.effort,
                temperature: settings.temperature,
                disableParallelToolCalls: settings.disableParallelToolCalls,
                embeddingProvider: settings.embeddingProvider,
                embeddingBaseUrl: settings.embeddingBaseUrl,
                embeddingModel: settings.embeddingModel,
                embeddingDimensions: settings.embeddingDimensions,
            };

            // Omitted entirely means "leave the stored key alone"; null clears it.
            if (clearApiKey) body.apiKey = null;
            else if (apiKey) body.apiKey = apiKey;
            if (embeddingApiKey) body.embeddingApiKey = embeddingApiKey;

            await saveSettings.mutateAsync(body);

            // The mutation writes the authoritative copy into the cache, so the
            // local draft has nothing left to say.
            setDraft({});
            setApiKey("");
            setEmbeddingApiKey("");
            setClearApiKey(false);
            setDirty(false);
            setDialog({
                isOpen: true,
                title: "Saved",
                message: "Your settings have been saved.",
                type: "success",
            });
        } catch (error) {
            setDialog({
                isOpen: true,
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to save settings",
                type: "error",
            });
        }
    };

    const handleTest = async () => {
        try {
            const result = await testConnection.mutateAsync();

            if (result.ok) {
                const lines = [
                    `Connected to ${result.model} in ${result.latencyMs} ms.`,
                    result.reply ? `Replied: "${result.reply}"` : "",
                    result.embeddings
                        ? result.embeddings.ok
                            ? `Embeddings: ${result.embeddings.model} returned ${result.embeddings.dimensions} dimensions.`
                            : `Embeddings failed: ${result.embeddings.error}`
                        : "",
                ].filter(Boolean);

                setDialog({
                    isOpen: true,
                    title: result.embeddings && !result.embeddings.ok ? "Partly working" : "Connection OK",
                    message: lines.join("\n"),
                    type: result.embeddings && !result.embeddings.ok ? "warning" : "success",
                });
            } else {
                setDialog({
                    isOpen: true,
                    title: "Connection failed",
                    message: result.error ?? "The provider could not be reached.",
                    type: "error",
                });
            }
        } catch (error) {
            setDialog({
                isOpen: true,
                title: "Error",
                message: error instanceof Error ? error.message : "Connection test failed",
                type: "error",
            });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 py-8">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="mb-8">
                        <Navigation />
                    </div>
                    <div className="text-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
                        <p className="mt-4 text-gray-600">Loading settings...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4">
                <div className="mb-8">
                    <Navigation />
                    <div className="mt-4">
                        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
                        <p className="text-gray-600 text-sm mt-1">
                            Connect the AI agent to a language model.
                        </p>
                    </div>
                </div>

                {loadError && (
                    <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800">
                            <p className="font-medium">Could not load settings</p>
                            <p className="mt-1">
                                {loadError instanceof Error ? loadError.message : "Please try again."}
                            </p>
                        </div>
                    </div>
                )}

                {settings && !settings.secretKeyConfigured && (
                    <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800">
                            <p className="font-medium">No encryption key configured</p>
                            <p className="mt-1">
                                Set <code className="font-mono text-xs">AGENT_SECRET_KEY</code> in your
                                environment before saving an API key. Generate one with{" "}
                                <code className="font-mono text-xs">openssl rand -base64 32</code>.
                            </p>
                        </div>
                    </div>
                )}

                {settings?.apiKeyDecryptionFailed && (
                    <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800">
                            <p className="font-medium">Stored API key cannot be decrypted</p>
                            <p className="mt-1">
                                The encryption key has changed since the key was saved. Enter your API
                                key again to fix this.
                            </p>
                        </div>
                    </div>
                )}

                {settings && (
                    <div className="grid gap-6">
                        <ProviderForm
                            settings={settings}
                            apiKey={apiKey}
                            showApiKey={showApiKey}
                            onChange={patch}
                            onApiKeyChange={(value) => {
                                setApiKey(value);
                                setClearApiKey(false);
                                setDirty(true);
                            }}
                            onToggleApiKey={() => setShowApiKey((v) => !v)}
                            onClearApiKey={() => {
                                setApiKey("");
                                setClearApiKey(true);
                                setDirty(true);
                            }}
                        />

                        {clearApiKey && (
                            <p className="-mt-3 text-sm text-red-600">
                                The stored API key will be removed when you save.
                            </p>
                        )}

                        <EmbeddingForm
                            settings={settings}
                            embeddingApiKey={embeddingApiKey}
                            onChange={patch}
                            onEmbeddingApiKeyChange={(value) => {
                                setEmbeddingApiKey(value);
                                setDirty(true);
                            }}
                        />

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving || !dirty}
                                className="flex items-center gap-2 bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {saving ? "Saving..." : "Save settings"}
                            </button>

                            <button
                                onClick={handleTest}
                                disabled={testing || dirty}
                                title={dirty ? "Save your changes before testing" : undefined}
                                className="flex items-center gap-2 border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {testing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Plug className="w-4 h-4" />
                                )}
                                {testing ? "Testing..." : "Test connection"}
                            </button>

                            {dirty && (
                                <span className="text-sm text-gray-500">Unsaved changes</span>
                            )}
                        </div>

                        <ApiTokensPanel />
                    </div>
                )}

                <Footer />
            </div>

            <Dialog
                isOpen={dialog.isOpen}
                onClose={() => setDialog(CLOSED_DIALOG)}
                title={dialog.title}
                message={dialog.message}
                type={dialog.type}
            />
        </div>
    );
}
