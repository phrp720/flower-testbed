import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { decryptSecret, encryptSecret, isSecretKeyConfigured, secretHint } from '@/lib/crypto/secrets';
import { ValidationError } from '@/lib/errors';
import type { LlmEffort, LlmProviderName } from './types';

/**
 * The single row of LLM connection config.
 *
 * Two shapes deliberately exist: the decrypted one never leaves the server, and
 * the public one (which carries only a 4-character hint) is what any HTTP
 * response is allowed to contain.
 */

export const SETTINGS_KEY = 'default';

export type AgentSettingsRow = typeof schema.agentSettings.$inferSelect;

export interface AgentSettings {
  provider: LlmProviderName;
  baseUrl: string | null;
  apiKey: string | null;
  model: string;
  maxTokens: number;
  effort: LlmEffort;
  temperature: number | null;
  disableParallelToolCalls: boolean;
  /** Seeds a new conversation's autoRun; the conversation's own flag still rules. */
  defaultAutoRun: boolean;
  systemPromptOverride: string | null;

  embeddingProvider: 'none' | 'openai-compatible';
  embeddingBaseUrl: string | null;
  embeddingApiKey: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number;
}

/** Safe to serialise over HTTP. */
export interface PublicAgentSettings
  extends Omit<AgentSettings, 'apiKey' | 'embeddingApiKey'> {
  hasApiKey: boolean;
  apiKeyHint: string | null;
  hasEmbeddingApiKey: boolean;
  embeddingApiKeyHint: string | null;
  secretKeyConfigured: boolean;
  apiKeyDecryptionFailed: boolean;
}

const DEFAULTS: AgentSettings = {
  provider: 'anthropic',
  baseUrl: null,
  apiKey: null,
  model: 'claude-opus-5',
  maxTokens: 16000,
  effort: 'high',
  temperature: null,
  disableParallelToolCalls: false,
  defaultAutoRun: false,
  systemPromptOverride: null,
  embeddingProvider: 'none',
  embeddingBaseUrl: null,
  embeddingApiKey: null,
  embeddingModel: null,
  embeddingDimensions: 1536,
};

export const PROVIDERS: LlmProviderName[] = ['anthropic', 'openai-compatible'];
export const EFFORTS: LlmEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

async function readRow(): Promise<AgentSettingsRow | null> {
  const [row] = await db
    .select()
    .from(schema.agentSettings)
    .where(eq(schema.agentSettings.settingsKey, SETTINGS_KEY));
  return row ?? null;
}

/** Decrypts. Server-side only -- never let the result reach a response body. */
export async function loadAgentSettings(): Promise<AgentSettings> {
  const row = await readRow();
  if (!row) return { ...DEFAULTS };

  return {
    provider: row.provider as LlmProviderName,
    baseUrl: row.baseUrl,
    apiKey: row.apiKeyCiphertext ? decryptSecret(row.apiKeyCiphertext) : null,
    model: row.model,
    maxTokens: row.maxTokens,
    effort: row.effort as LlmEffort,
    temperature: row.temperature,
    disableParallelToolCalls: row.disableParallelToolCalls,
    defaultAutoRun: row.defaultAutoRun,
    systemPromptOverride: row.systemPromptOverride,
    embeddingProvider: row.embeddingProvider as 'none' | 'openai-compatible',
    embeddingBaseUrl: row.embeddingBaseUrl,
    embeddingApiKey: row.embeddingApiKeyCiphertext
      ? decryptSecret(row.embeddingApiKeyCiphertext)
      : null,
    embeddingModel: row.embeddingModel,
    embeddingDimensions: row.embeddingDimensions,
  };
}

/**
 * Never decrypts, so a rotated encryption key surfaces as a flag the settings
 * page can act on rather than as a 500.
 */
export async function loadPublicAgentSettings(): Promise<PublicAgentSettings> {
  const row = await readRow();
  const secretKeyConfigured = isSecretKeyConfigured();

  let apiKeyDecryptionFailed = false;
  if (row?.apiKeyCiphertext && secretKeyConfigured) {
    try {
      decryptSecret(row.apiKeyCiphertext);
    } catch {
      apiKeyDecryptionFailed = true;
    }
  }

  const base = row
    ? {
        provider: row.provider as LlmProviderName,
        baseUrl: row.baseUrl,
        model: row.model,
        maxTokens: row.maxTokens,
        effort: row.effort as LlmEffort,
        temperature: row.temperature,
        disableParallelToolCalls: row.disableParallelToolCalls,
        defaultAutoRun: row.defaultAutoRun,
        systemPromptOverride: row.systemPromptOverride,
        embeddingProvider: row.embeddingProvider as 'none' | 'openai-compatible',
        embeddingBaseUrl: row.embeddingBaseUrl,
        embeddingModel: row.embeddingModel,
        embeddingDimensions: row.embeddingDimensions,
      }
    : {
        provider: DEFAULTS.provider,
        baseUrl: DEFAULTS.baseUrl,
        model: DEFAULTS.model,
        maxTokens: DEFAULTS.maxTokens,
        effort: DEFAULTS.effort,
        temperature: DEFAULTS.temperature,
        disableParallelToolCalls: DEFAULTS.disableParallelToolCalls,
        defaultAutoRun: DEFAULTS.defaultAutoRun,
        systemPromptOverride: DEFAULTS.systemPromptOverride,
        embeddingProvider: DEFAULTS.embeddingProvider,
        embeddingBaseUrl: DEFAULTS.embeddingBaseUrl,
        embeddingModel: DEFAULTS.embeddingModel,
        embeddingDimensions: DEFAULTS.embeddingDimensions,
      };

  return {
    ...base,
    hasApiKey: Boolean(row?.apiKeyCiphertext),
    apiKeyHint: row?.apiKeyHint ?? null,
    hasEmbeddingApiKey: Boolean(row?.embeddingApiKeyCiphertext),
    embeddingApiKeyHint: row?.embeddingApiKeyHint ?? null,
    secretKeyConfigured,
    apiKeyDecryptionFailed,
  };
}

export interface SaveAgentSettingsInput {
  provider?: string;
  baseUrl?: string | null;
  /** Omitted or undefined leaves the stored key alone; null clears it. */
  apiKey?: string | null;
  model?: string;
  maxTokens?: number;
  effort?: string;
  temperature?: number | null;
  disableParallelToolCalls?: boolean;
  defaultAutoRun?: boolean;
  systemPromptOverride?: string | null;
  embeddingProvider?: string;
  embeddingBaseUrl?: string | null;
  embeddingApiKey?: string | null;
  embeddingModel?: string | null;
  embeddingDimensions?: number;
}

function normaliseBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

export async function saveAgentSettings(
  input: SaveAgentSettingsInput
): Promise<PublicAgentSettings> {
  const existing = await readRow();

  if (input.provider && !PROVIDERS.includes(input.provider as LlmProviderName)) {
    throw new ValidationError(`Unknown provider. Must be one of: ${PROVIDERS.join(', ')}`);
  }
  if (input.effort && !EFFORTS.includes(input.effort as LlmEffort)) {
    throw new ValidationError(`Unknown effort. Must be one of: ${EFFORTS.join(', ')}`);
  }
  if (input.maxTokens !== undefined && (input.maxTokens < 256 || input.maxTokens > 128000)) {
    throw new ValidationError('maxTokens must be between 256 and 128000.');
  }
  if (input.embeddingDimensions !== undefined && input.embeddingDimensions < 1) {
    throw new ValidationError('embeddingDimensions must be a positive integer.');
  }

  const provider = (input.provider ?? existing?.provider ?? DEFAULTS.provider) as LlmProviderName;
  const baseUrl = normaliseBaseUrl(
    input.baseUrl !== undefined ? input.baseUrl : existing?.baseUrl
  );

  // A provider that is not Anthropic has no default endpoint to fall back on.
  if (provider === 'openai-compatible' && !baseUrl) {
    throw new ValidationError('A base URL is required for an OpenAI-compatible provider.');
  }

  // Encrypting requires a key; refuse loudly rather than storing anything weaker.
  const wantsSecretWrite =
    (input.apiKey !== undefined && input.apiKey !== null && input.apiKey !== '') ||
    (input.embeddingApiKey !== undefined &&
      input.embeddingApiKey !== null &&
      input.embeddingApiKey !== '');

  if (wantsSecretWrite && !isSecretKeyConfigured()) {
    throw new ValidationError(
      'No encryption key configured. Set AGENT_SECRET_KEY (openssl rand -base64 32) ' +
        'before saving an API key.'
    );
  }

  // undefined => leave as-is, null/'' => clear, otherwise => re-encrypt.
  const apiKeyFields =
    input.apiKey === undefined
      ? {}
      : input.apiKey
        ? {
            apiKeyCiphertext: encryptSecret(input.apiKey),
            apiKeyHint: secretHint(input.apiKey),
          }
        : { apiKeyCiphertext: null, apiKeyHint: null };

  const embeddingKeyFields =
    input.embeddingApiKey === undefined
      ? {}
      : input.embeddingApiKey
        ? {
            embeddingApiKeyCiphertext: encryptSecret(input.embeddingApiKey),
            embeddingApiKeyHint: secretHint(input.embeddingApiKey),
          }
        : { embeddingApiKeyCiphertext: null, embeddingApiKeyHint: null };

  const values = {
    settingsKey: SETTINGS_KEY,
    provider,
    baseUrl,
    model: input.model?.trim() || existing?.model || DEFAULTS.model,
    maxTokens: input.maxTokens ?? existing?.maxTokens ?? DEFAULTS.maxTokens,
    effort: input.effort ?? existing?.effort ?? DEFAULTS.effort,
    temperature:
      input.temperature !== undefined ? input.temperature : (existing?.temperature ?? null),
    disableParallelToolCalls:
      input.disableParallelToolCalls ?? existing?.disableParallelToolCalls ?? false,
    defaultAutoRun: input.defaultAutoRun ?? existing?.defaultAutoRun ?? false,
    systemPromptOverride:
      input.systemPromptOverride !== undefined
        ? input.systemPromptOverride
        : (existing?.systemPromptOverride ?? null),
    embeddingProvider:
      input.embeddingProvider ?? existing?.embeddingProvider ?? DEFAULTS.embeddingProvider,
    embeddingBaseUrl: normaliseBaseUrl(
      input.embeddingBaseUrl !== undefined ? input.embeddingBaseUrl : existing?.embeddingBaseUrl
    ),
    embeddingModel:
      input.embeddingModel !== undefined
        ? input.embeddingModel
        : (existing?.embeddingModel ?? null),
    embeddingDimensions:
      input.embeddingDimensions ?? existing?.embeddingDimensions ?? DEFAULTS.embeddingDimensions,
    updatedAt: new Date(),
    ...apiKeyFields,
    ...embeddingKeyFields,
  };

  await db
    .insert(schema.agentSettings)
    .values(values)
    .onConflictDoUpdate({ target: schema.agentSettings.settingsKey, set: values });

  return loadPublicAgentSettings();
}
