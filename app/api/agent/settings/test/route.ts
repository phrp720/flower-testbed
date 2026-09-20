import { NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { isServiceError } from '@/lib/errors';
import { createProvider } from '@/lib/llm';
import { loadAgentSettings } from '@/lib/llm/settings';
import { getEmbeddingProvider } from '@/lib/llm/embeddings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/settings/test - one minimal round trip against the configured
 * provider, so a misconfiguration surfaces here rather than mid-conversation.
 *
 * Errors are reported as a 200 body: a failed probe is a successful test, and
 * the UI wants the message either way.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const settings = await loadAgentSettings();
    const provider = createProvider(settings);

    const startedAt = Date.now();
    const turn = await provider.chat(
      [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word: ok' }] }],
      { maxTokens: 16, effort: 'low' }
    );
    const latencyMs = Date.now() - startedAt;

    const reply = turn.blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    let embeddings: { ok: boolean; model?: string; dimensions?: number; error?: string } | null =
      null;

    if (settings.embeddingProvider !== 'none') {
      try {
        const embedder = getEmbeddingProvider(settings);
        if (embedder) {
          const [vector] = await embedder.embed(['connection test']);
          embeddings = { ok: true, model: embedder.model, dimensions: vector.length };
        }
      } catch (embeddingError) {
        embeddings = {
          ok: false,
          error:
            embeddingError instanceof Error ? embeddingError.message : 'Embedding request failed',
        };
      }
    }

    return NextResponse.json({
      ok: true,
      provider: turn.provider,
      model: turn.model,
      latencyMs,
      reply: reply.slice(0, 200),
      usage: turn.usage,
      embeddings,
    });
  } catch (error) {
    // Never echo the key, and never leak an SDK error object wholesale.
    const message = isServiceError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Connection test failed';

    if (!isServiceError(error)) console.error('Agent settings test failed:', message);

    return NextResponse.json({ ok: false, error: message });
  }
}
