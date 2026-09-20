"use client";

import {
    Button,
    Callout,
    Card,
    CardHeader,
    Field,
    Icon,
    Input,
    cn,
} from "@/app/components/ui";
import type { PublicSettings } from "./types";

type Props = {
    settings: PublicSettings;
    apiKey: string;
    showApiKey: boolean;
    clearApiKey: boolean;
    onChange: (patch: Partial<PublicSettings>) => void;
    onApiKeyChange: (value: string) => void;
    onToggleApiKey: () => void;
    onClearApiKey: () => void;
};

const PROVIDERS = [
    {
        value: "anthropic" as const,
        label: "Anthropic",
        description: "Claude, via the official API",
    },
    {
        value: "openai-compatible" as const,
        label: "OpenAI-compatible",
        description: "Ollama, vLLM, LM Studio, OpenRouter",
    },
];

/** How to reach a model: provider, endpoint, credentials, which model. */
export default function ModelForm({
    settings,
    apiKey,
    showApiKey,
    clearApiKey,
    onChange,
    onApiKeyChange,
    onToggleApiKey,
    onClearApiKey,
}: Props) {
    const isAnthropic = settings.provider === "anthropic";

    return (
        <Card>
            <CardHeader
                title="Connection"
                description="Where the agent sends its requests, and what it identifies as."
                className="mb-5"
            />

            <div className="space-y-4">
                <Field label="Provider">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PROVIDERS.map((provider) => {
                            const selected = settings.provider === provider.value;
                            return (
                                <button
                                    key={provider.value}
                                    type="button"
                                    onClick={() => onChange({ provider: provider.value })}
                                    aria-pressed={selected}
                                    className={cn(
                                        "text-left rounded-[var(--radius)] border px-3.5 py-3 transition-colors",
                                        selected
                                            ? "border-accent bg-accent text-ink-inverted"
                                            : "border-line-strong hover:bg-surface-hover"
                                    )}
                                >
                                    <span className="block text-sm font-medium">{provider.label}</span>
                                    <span
                                        className={cn(
                                            "block text-xs mt-0.5",
                                            selected ? "opacity-70" : "text-ink-subtle"
                                        )}
                                    >
                                        {provider.description}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </Field>

                <Input
                    label={isAnthropic ? "Base URL (optional)" : "Base URL"}
                    type="url"
                    placeholder={isAnthropic ? "https://api.anthropic.com" : "http://localhost:11434/v1"}
                    value={settings.baseUrl ?? ""}
                    onChange={(e) => onChange({ baseUrl: e.target.value || null })}
                    hint={
                        isAnthropic
                            ? "Leave empty for the default Anthropic endpoint."
                            : "Include the version prefix your server exposes, such as /v1."
                    }
                />

                <Field
                    label="API key"
                    htmlFor="apiKey"
                    hint="Encrypted before storage and never sent back to the browser. Leave blank to keep the existing key."
                >
                    <div className="relative">
                        <input
                            id="apiKey"
                            type={showApiKey ? "text" : "password"}
                            autoComplete="off"
                            value={apiKey}
                            onChange={(e) => onApiKeyChange(e.target.value)}
                            placeholder={
                                settings.hasApiKey
                                    ? `Stored — ends in ${settings.apiKeyHint ?? "****"}`
                                    : isAnthropic
                                    ? "sk-ant-..."
                                    : "Often not needed for a local server"
                            }
                            className="w-full h-9 pl-3 pr-10 rounded-[var(--radius)] border border-line-strong bg-surface text-ink text-sm placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                        />
                        <button
                            type="button"
                            onClick={onToggleApiKey}
                            aria-label={showApiKey ? "Hide API key" : "Show API key"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded text-ink-subtle hover:text-ink transition-colors"
                        >
                            <Icon name={showApiKey ? "hide" : "view"} size={15} />
                        </button>
                    </div>
                    {settings.hasApiKey && !clearApiKey && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={onClearApiKey}
                            className="mt-1.5 -ml-2.5 text-danger hover:text-danger hover:bg-danger-surface"
                        >
                            Remove stored key
                        </Button>
                    )}
                </Field>

                {clearApiKey && (
                    <Callout tone="danger">
                        The stored API key will be removed when you save.
                    </Callout>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                        label="Model"
                        value={settings.model}
                        onChange={(e) => onChange({ model: e.target.value })}
                        placeholder={isAnthropic ? "claude-opus-5" : "the id your server exposes"}
                        autoComplete="off"
                        spellCheck={false}
                        className="font-mono"
                        wrapperClassName="sm:col-span-2"
                        hint="Exactly as the provider names it."
                    />

                    <Input
                        label="Max tokens"
                        type="number"
                        min={256}
                        max={128000}
                        value={settings.maxTokens}
                        onChange={(e) => onChange({ maxTokens: Number(e.target.value) })}
                        hint="Per reply"
                    />
                </div>
            </div>
        </Card>
    );
}
