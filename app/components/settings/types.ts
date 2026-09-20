export type PublicSettings = {
    provider: 'anthropic' | 'openai-compatible';
    baseUrl: string | null;
    model: string;
    maxTokens: number;
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    temperature: number | null;
    disableParallelToolCalls: boolean;
    systemPromptOverride: string | null;
    embeddingProvider: 'none' | 'openai-compatible';
    embeddingBaseUrl: string | null;
    embeddingModel: string | null;
    embeddingDimensions: number;
    hasApiKey: boolean;
    apiKeyHint: string | null;
    hasEmbeddingApiKey: boolean;
    embeddingApiKeyHint: string | null;
    secretKeyConfigured: boolean;
    apiKeyDecryptionFailed: boolean;
};

export type TestResult = {
    ok: boolean;
    provider?: string;
    model?: string;
    latencyMs?: number;
    reply?: string;
    usage?: { inputTokens: number; outputTokens: number };
    embeddings?: { ok: boolean; model?: string; dimensions?: number; error?: string } | null;
    error?: string;
};

// Repeated verbatim from the experiment forms so inputs match across the app.
export const INPUT_CLASS =
    "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent";

export const LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-1.5";

export const HINT_CLASS = "text-xs text-gray-500 mt-1.5";
