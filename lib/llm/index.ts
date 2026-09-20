import { ValidationError } from '@/lib/errors';
import { AnthropicProvider } from './anthropic';
import { OpenAiCompatibleProvider } from './openai-compatible';
import { loadAgentSettings, type AgentSettings } from './settings';
import type { LlmProvider } from './types';

export * from './types';
export * from './settings';
export { getEmbeddingProvider, fitToStorageWidth } from './embeddings';
export { rejectsSamplingParams } from './anthropic';

export function createProvider(settings: AgentSettings): LlmProvider {
  if (!settings.apiKey && settings.provider === 'anthropic') {
    throw new ValidationError('No API key configured. Add one in Settings.');
  }

  if (settings.provider === 'anthropic') {
    return new AnthropicProvider({
      apiKey: settings.apiKey!,
      baseUrl: settings.baseUrl,
      model: settings.model,
      maxTokens: settings.maxTokens,
    });
  }

  if (!settings.baseUrl) {
    throw new ValidationError('A base URL is required for an OpenAI-compatible provider.');
  }

  // A local server (Ollama, vLLM, LM Studio) commonly needs no key at all.
  return new OpenAiCompatibleProvider({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    maxTokens: settings.maxTokens,
  });
}

export async function getProvider(): Promise<{ provider: LlmProvider; settings: AgentSettings }> {
  const settings = await loadAgentSettings();
  return { provider: createProvider(settings), settings };
}
