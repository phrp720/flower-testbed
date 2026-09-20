import { EMBEDDING_STORAGE_DIMENSIONS } from '@/lib/db/agent-schema';
import { ValidationError } from '@/lib/errors';
import type { AgentSettings } from './settings';
import type { EmbeddingProvider } from './types';

/**
 * Embeddings for the agent's memory.
 *
 * Anthropic has no embeddings endpoint, so this is configured independently of
 * the chat provider. When it is left off, memory search degrades to Postgres
 * full-text over the stored content rather than disappearing.
 */

/**
 * Stored vectors are a fixed width so one HNSW index serves every model.
 *
 * Narrower models are zero-padded, which is exact for cosine similarity: padding
 * changes neither dot products nor norms, so cos(pad(a), pad(b)) == cos(a, b).
 * Wider models are asked for the storage width via the `dimensions` request
 * field first, and only truncated-and-renormalised if the server ignores it.
 */
export function fitToStorageWidth(vector: number[]): number[] {
  if (vector.length === EMBEDDING_STORAGE_DIMENSIONS) return vector;

  if (vector.length < EMBEDDING_STORAGE_DIMENSIONS) {
    return [...vector, ...new Array(EMBEDDING_STORAGE_DIMENSIONS - vector.length).fill(0)];
  }

  const truncated = vector.slice(0, EMBEDDING_STORAGE_DIMENSIONS);
  const norm = Math.sqrt(truncated.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? truncated.map((v) => v / norm) : truncated;
}

interface OpenAiEmbeddingResponse {
  data?: Array<{ embedding: number[]; index: number }>;
}

interface OllamaEmbeddingResponse {
  embeddings?: number[][];
  embedding?: number[];
}

export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;

  constructor(config: {
    baseUrl: string;
    apiKey?: string | null;
    model: string;
    dimensions: number;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey ?? null;
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        // Honoured by text-embedding-3-* and most Matryoshka servers; ignored
        // elsewhere, in which case fitToStorageWidth handles the difference.
        ...(this.dimensions > EMBEDDING_STORAGE_DIMENSIONS
          ? { dimensions: EMBEDDING_STORAGE_DIMENSIONS }
          : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Embedding request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`
      );
    }

    const payload = (await response.json()) as OpenAiEmbeddingResponse & OllamaEmbeddingResponse;

    // OpenAI shape
    if (payload.data) {
      return payload.data
        .sort((a, b) => a.index - b.index)
        .map((entry) => fitToStorageWidth(entry.embedding));
    }

    // Ollama's native /api/embeddings shape, for servers not exposing /v1.
    if (payload.embeddings) return payload.embeddings.map(fitToStorageWidth);
    if (payload.embedding) return [fitToStorageWidth(payload.embedding)];

    throw new Error('Embedding response contained no vectors.');
  }
}

export function getEmbeddingProvider(settings: AgentSettings): EmbeddingProvider | null {
  if (settings.embeddingProvider === 'none') return null;

  if (!settings.embeddingBaseUrl || !settings.embeddingModel) {
    throw new ValidationError(
      'Embeddings are enabled but no base URL or model is configured. Anthropic has no ' +
        'embeddings endpoint, so this must point at an OpenAI-compatible server.'
    );
  }

  return new OpenAiCompatibleEmbeddingProvider({
    baseUrl: settings.embeddingBaseUrl,
    apiKey: settings.embeddingApiKey,
    model: settings.embeddingModel,
    dimensions: settings.embeddingDimensions,
  });
}
