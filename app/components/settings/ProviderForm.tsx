"use client";

import { Eye, EyeOff } from "lucide-react";
import { HINT_CLASS, INPUT_CLASS, LABEL_CLASS, PublicSettings } from "./types";

type Props = {
    settings: PublicSettings;
    apiKey: string;
    showApiKey: boolean;
    onChange: (patch: Partial<PublicSettings>) => void;
    onApiKeyChange: (value: string) => void;
    onToggleApiKey: () => void;
    onClearApiKey: () => void;
};

const MODEL_SUGGESTIONS = [
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-haiku-4-5",
];

export default function ProviderForm({
    settings,
    apiKey,
    showApiKey,
    onChange,
    onApiKeyChange,
    onToggleApiKey,
    onClearApiKey,
}: Props) {
    const isAnthropic = settings.provider === "anthropic";

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900">Chat model</h3>
            <p className="text-gray-600 text-sm mt-1 mb-6">
                The model the AI agent uses to reason about your experiments.
            </p>

            <div className="grid gap-5">
                <div>
                    <label className={LABEL_CLASS}>Provider</label>
                    <div className="grid grid-cols-2 gap-3">
                        {(["anthropic", "openai-compatible"] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => onChange({ provider: value })}
                                className={`rounded-lg border px-4 py-3 text-sm font-medium text-left transition-colors ${
                                    settings.provider === value
                                        ? "border-gray-800 bg-gray-800 text-white"
                                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                                }`}
                            >
                                {value === "anthropic" ? "Anthropic" : "OpenAI-compatible"}
                                <span
                                    className={`block text-xs font-normal mt-0.5 ${
                                        settings.provider === value ? "text-gray-300" : "text-gray-500"
                                    }`}
                                >
                                    {value === "anthropic"
                                        ? "Claude, via the official API"
                                        : "Ollama, vLLM, LM Studio, OpenRouter"}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className={LABEL_CLASS} htmlFor="baseUrl">
                        Base URL {isAnthropic && <span className="text-gray-400">(optional)</span>}
                    </label>
                    <input
                        id="baseUrl"
                        type="url"
                        className={INPUT_CLASS}
                        placeholder={
                            isAnthropic ? "https://api.anthropic.com" : "http://localhost:11434/v1"
                        }
                        value={settings.baseUrl ?? ""}
                        onChange={(e) => onChange({ baseUrl: e.target.value || null })}
                    />
                    <p className={HINT_CLASS}>
                        {isAnthropic
                            ? "Leave empty to use the default Anthropic endpoint."
                            : "Must include the version prefix your server exposes, e.g. /v1."}
                    </p>
                </div>

                <div>
                    <label className={LABEL_CLASS} htmlFor="apiKey">
                        API key
                    </label>
                    <div className="relative">
                        <input
                            id="apiKey"
                            type={showApiKey ? "text" : "password"}
                            className={`${INPUT_CLASS} pr-11`}
                            placeholder={
                                settings.hasApiKey
                                    ? `Stored — ends in ${settings.apiKeyHint ?? "****"}`
                                    : isAnthropic
                                      ? "sk-ant-..."
                                      : "Often not needed for a local server"
                            }
                            value={apiKey}
                            onChange={(e) => onApiKeyChange(e.target.value)}
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            onClick={onToggleApiKey}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            aria-label={showApiKey ? "Hide API key" : "Show API key"}
                        >
                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <p className={HINT_CLASS}>
                            Encrypted before it is stored, and never sent back to the browser.
                            Leave blank to keep the existing key.
                        </p>
                        {settings.hasApiKey && (
                            <button
                                type="button"
                                onClick={onClearApiKey}
                                className="text-xs text-red-600 hover:text-red-700 whitespace-nowrap mt-1.5"
                            >
                                Remove key
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                        <label className={LABEL_CLASS} htmlFor="model">
                            Model
                        </label>
                        <input
                            id="model"
                            className={INPUT_CLASS}
                            list="model-suggestions"
                            value={settings.model}
                            onChange={(e) => onChange({ model: e.target.value })}
                        />
                        <datalist id="model-suggestions">
                            {MODEL_SUGGESTIONS.map((m) => (
                                <option key={m} value={m} />
                            ))}
                        </datalist>
                    </div>

                    <div>
                        <label className={LABEL_CLASS} htmlFor="maxTokens">
                            Max tokens
                        </label>
                        <input
                            id="maxTokens"
                            type="number"
                            min={256}
                            max={128000}
                            className={INPUT_CLASS}
                            value={settings.maxTokens}
                            onChange={(e) => onChange({ maxTokens: Number(e.target.value) })}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={LABEL_CLASS} htmlFor="effort">
                            Effort
                        </label>
                        <select
                            id="effort"
                            className={INPUT_CLASS}
                            value={settings.effort}
                            onChange={(e) =>
                                onChange({ effort: e.target.value as PublicSettings["effort"] })
                            }
                        >
                            {(["low", "medium", "high", "xhigh", "max"] as const).map((e) => (
                                <option key={e} value={e}>
                                    {e}
                                </option>
                            ))}
                        </select>
                        <p className={HINT_CLASS}>
                            {isAnthropic
                                ? "How much the model deliberates before answering. Higher costs more."
                                : "Anthropic only; ignored by OpenAI-compatible servers."}
                        </p>
                    </div>

                    <div>
                        <label className={LABEL_CLASS} htmlFor="temperature">
                            Temperature <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                            id="temperature"
                            type="number"
                            step="0.1"
                            min={0}
                            max={2}
                            className={INPUT_CLASS}
                            placeholder="provider default"
                            value={settings.temperature ?? ""}
                            onChange={(e) =>
                                onChange({
                                    temperature: e.target.value === "" ? null : Number(e.target.value),
                                })
                            }
                        />
                        <p className={HINT_CLASS}>
                            {isAnthropic
                                ? "Dropped automatically for Claude models that reject sampling parameters."
                                : "Passed straight through to your server."}
                        </p>
                    </div>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-800 focus:ring-gray-400"
                        checked={settings.disableParallelToolCalls}
                        onChange={(e) => onChange({ disableParallelToolCalls: e.target.checked })}
                    />
                    <span className="text-sm text-gray-700">
                        Disable parallel tool calls
                        <span className="block text-xs text-gray-500 mt-0.5">
                            Forces one tool call per turn. Useful for smaller local models that
                            mishandle several at once.
                        </span>
                    </span>
                </label>
            </div>
        </div>
    );
}
