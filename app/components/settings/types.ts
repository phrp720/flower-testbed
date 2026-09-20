export type PublicSettings = {
    provider: 'anthropic' | 'openai-compatible';
    baseUrl: string | null;
    model: string;
    maxTokens: number;
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    temperature: number | null;
    disableParallelToolCalls: boolean;
    defaultAutoRun: boolean;
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
