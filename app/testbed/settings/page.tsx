"use client";

import { useState } from "react";
import Dialog from "@/app/components/Dialog";
import {
    Button,
    Callout,
    Card,
    PageHeader,
    Spinner,
    TabPanel,
    Tabs,
} from "@/app/components/ui";
import ModelForm from "@/app/components/settings/ModelForm";
import BehaviourForm from "@/app/components/settings/BehaviourForm";
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

type TabId = "connection" | "behaviour" | "memory" | "access";

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
    const [tab, setTab] = useState<TabId>("connection");

    /**
     * Which tab each editable field lives behind.
     *
     * Only used to mark a tab that has unsaved edits, but that marker is what
     * makes tabs safe here: one Save covers all three settings tabs, so without
     * it a change made on a tab you have since left is invisible.
     */
    const tabOf: Record<string, TabId> = {
        provider: "connection",
        baseUrl: "connection",
        model: "connection",
        maxTokens: "connection",
        effort: "behaviour",
        temperature: "behaviour",
        disableParallelToolCalls: "behaviour",
        systemPromptOverride: "behaviour",
        embeddingProvider: "memory",
        embeddingBaseUrl: "memory",
        embeddingModel: "memory",
        embeddingDimensions: "memory",
    };

    const editedTabs = new Set<TabId>(
        Object.keys(draft)
            .map((field) => tabOf[field])
            .filter(Boolean) as TabId[]
    );
    // Keys are held outside the draft, so they have to be attributed by hand.
    if (apiKey || clearApiKey) editedTabs.add("connection");
    if (embeddingApiKey) editedTabs.add("memory");

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
                systemPromptOverride: settings.systemPromptOverride,
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
            <Card className="flex justify-center py-20">
                <Spinner size={18} label="Loading settings" />
            </Card>
        );
    }

    const TABS = [
        { id: "connection" as const, label: "Model", icon: "agent" as const, marked: editedTabs.has("connection") },
        { id: "behaviour" as const, label: "Behaviour", icon: "thinking" as const, marked: editedTabs.has("behaviour") },
        { id: "memory" as const, label: "Memory", icon: "database" as const, marked: editedTabs.has("memory") },
        { id: "access" as const, label: "MCP access", icon: "token" as const },
    ];

    // MCP tokens save themselves the moment they are created or revoked, so the
    // Save bar would be a lie on that tab.
    const showSaveBar = tab !== "access";

    return (
        <>
            <PageHeader
                title="Settings"
                description="Connect the agent to a language model, and issue tokens for external MCP clients."
            />

            {loadError && (
                <Callout tone="danger" title="Could not load settings" className="mb-5">
                    {loadError instanceof Error ? loadError.message : "Please try again."}
                </Callout>
            )}

            {settings && !settings.secretKeyConfigured && (
                <Callout tone="warn" title="No encryption key configured" className="mb-5">
                    Set <code className="font-mono text-xs">AGENT_SECRET_KEY</code> in your
                    environment before saving an API key. Generate one with{" "}
                    <code className="font-mono text-xs">openssl rand -base64 32</code>.
                </Callout>
            )}

            {settings?.apiKeyDecryptionFailed && (
                <Callout tone="danger" title="Stored API key cannot be decrypted" className="mb-5">
                    The encryption key has changed since the key was saved. Enter your API key again
                    to fix this.
                </Callout>
            )}

            {settings && (
                <>
                    <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-5" />

                    <TabPanel id="connection" active={tab}>
                        <ModelForm
                            settings={settings}
                            apiKey={apiKey}
                            showApiKey={showApiKey}
                            clearApiKey={clearApiKey}
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
                    </TabPanel>

                    <TabPanel id="behaviour" active={tab}>
                        <BehaviourForm settings={settings} onChange={patch} />
                    </TabPanel>

                    <TabPanel id="memory" active={tab}>
                        <EmbeddingForm
                            settings={settings}
                            embeddingApiKey={embeddingApiKey}
                            onChange={patch}
                            onEmbeddingApiKeyChange={(value) => {
                                setEmbeddingApiKey(value);
                                setDirty(true);
                            }}
                        />
                    </TabPanel>

                    <TabPanel id="access" active={tab}>
                        <ApiTokensPanel />
                    </TabPanel>

                    {showSaveBar && (
                        /* Sticky, because the forms are long enough that Save
                           would otherwise scroll away mid-edit. */
                        <div className="sticky bottom-4 z-10 mt-5 flex items-center gap-3 p-3 rounded-[var(--radius)] border border-line bg-surface/95 backdrop-blur-sm">
                            <Button
                                variant="primary"
                                icon="save"
                                onClick={handleSave}
                                loading={saving}
                                disabled={!dirty}
                            >
                                {saving ? "Saving" : "Save settings"}
                            </Button>

                            <Button
                                icon="connection"
                                onClick={handleTest}
                                loading={testing}
                                disabled={dirty}
                                title={dirty ? "Save your changes before testing" : undefined}
                            >
                                {testing ? "Testing" : "Test connection"}
                            </Button>

                            {dirty && (
                                <span className="text-xs text-warn ml-auto">
                                    Unsaved changes
                                    {editedTabs.size > 1 && " on more than one tab"}
                                </span>
                            )}
                        </div>
                    )}
                </>
            )}

            <Dialog
                isOpen={dialog.isOpen}
                onClose={() => setDialog(CLOSED_DIALOG)}
                title={dialog.title}
                message={dialog.message}
                type={dialog.type}
            />
        </>
    );
}
