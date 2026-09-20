import { and, cosineDistance, desc, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { EMBEDDING_STORAGE_DIMENSIONS } from '@/lib/db/agent-schema';
import { getEmbeddingProvider } from '@/lib/llm/embeddings';
import { loadAgentSettings } from '@/lib/llm/settings';
import { digestExperiment } from './analysis';
import {
  getCheckpoints,
  getExperiment,
  getMetrics,
  type Experiment,
} from '@/lib/experiments/service';

/**
 * The agent's long-term memory.
 *
 * Vectors from different embedding models are not comparable, so every row
 * records the model that produced it and recall filters on the active one. A
 * model change therefore degrades to an empty recall -- which is recoverable --
 * rather than to confident nonsense, and it never needs a migration.
 *
 * Embeddings are optional. With none configured, recall falls back to Postgres
 * full-text search over the same stored text. Weaker, but the feature still works,
 * which matters because Anthropic has no embeddings endpoint.
 */

export type MemorySourceType =
  | 'experiment'
  | 'artifact'
  | 'conversation_summary'
  | 'insight';

export interface MemoryHit {
  id: string;
  sourceType: string;
  sourceId: string | null;
  sourceRef: string | null;
  content: string;
  metadata: unknown;
  /** 0-1 for vector search; absent for the full-text fallback. */
  similarity?: number;
  createdAt: Date;
}

interface EmbedderState {
  embed: (texts: string[]) => Promise<number[][]>;
  model: string;
  dimensions: number;
}

async function getEmbedder(): Promise<EmbedderState | null> {
  const settings = await loadAgentSettings();
  const provider = getEmbeddingProvider(settings);
  if (!provider) return null;

  return {
    embed: (texts) => provider.embed(texts),
    model: provider.model,
    dimensions: provider.dimensions,
  };
}

export interface RememberInput {
  sourceType: MemorySourceType;
  sourceId?: string | null;
  sourceRef?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Store a memory. Replaces any previous rows for the same source, so re-indexing
 * an experiment updates it rather than accumulating stale duplicates.
 */
export async function remember(input: RememberInput): Promise<{ stored: boolean; reason?: string }> {
  const content = input.content.trim();
  if (!content) return { stored: false, reason: 'empty content' };

  const embedder = await getEmbedder();
  if (!embedder) {
    return { stored: false, reason: 'embeddings are not configured' };
  }

  const [vector] = await embedder.embed([content]);
  if (!vector || vector.length !== EMBEDDING_STORAGE_DIMENSIONS) {
    return { stored: false, reason: 'embedding provider returned an unusable vector' };
  }

  if (input.sourceId) {
    await db
      .delete(schema.agentEmbeddings)
      .where(
        and(
          eq(schema.agentEmbeddings.sourceType, input.sourceType),
          eq(schema.agentEmbeddings.sourceId, input.sourceId)
        )
      );
  }

  await db.insert(schema.agentEmbeddings).values({
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    sourceRef: input.sourceRef ?? null,
    content,
    metadata: input.metadata ?? null,
    embeddingModel: embedder.model,
    dimensions: embedder.dimensions,
    embedding: vector,
  });

  return { stored: true };
}

export interface RecallOptions {
  limit?: number;
  sourceTypes?: string[];
  minSimilarity?: number;
}

export async function recall(query: string, options: RecallOptions = {}): Promise<{
  mode: 'vector' | 'fulltext';
  hits: MemoryHit[];
  note?: string;
}> {
  const limit = options.limit ?? 5;
  const embedder = await getEmbedder();

  if (!embedder) {
    return { ...(await recallFullText(query, limit, options.sourceTypes)) };
  }

  const [vector] = await embedder.embed([query]);
  const similarity = sql<number>`1 - (${cosineDistance(schema.agentEmbeddings.embedding, vector)})`;

  const filters = [
    // Rows from a different embedding model are not comparable to this query.
    eq(schema.agentEmbeddings.embeddingModel, embedder.model),
    gt(similarity, options.minSimilarity ?? 0.2),
  ];

  if (options.sourceTypes?.length) {
    filters.push(
      sql`${schema.agentEmbeddings.sourceType} = ANY(${sql.raw(
        `ARRAY[${options.sourceTypes.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}]`
      )})`
    );
  }

  const rows = await db
    .select({
      id: schema.agentEmbeddings.id,
      sourceType: schema.agentEmbeddings.sourceType,
      sourceId: schema.agentEmbeddings.sourceId,
      sourceRef: schema.agentEmbeddings.sourceRef,
      content: schema.agentEmbeddings.content,
      metadata: schema.agentEmbeddings.metadata,
      createdAt: schema.agentEmbeddings.createdAt,
      similarity,
    })
    .from(schema.agentEmbeddings)
    .where(and(...filters))
    .orderBy((t) => desc(t.similarity))
    .limit(limit);

  return { mode: 'vector', hits: rows };
}

/** Fallback when no embedding provider is configured. */
async function recallFullText(
  query: string,
  limit: number,
  sourceTypes?: string[]
): Promise<{ mode: 'fulltext'; hits: MemoryHit[]; note: string }> {
  const filters = [
    sql`to_tsvector('english', ${schema.agentEmbeddings.content}) @@ plainto_tsquery('english', ${query})`,
  ];

  if (sourceTypes?.length) {
    filters.push(
      sql`${schema.agentEmbeddings.sourceType} = ANY(${sql.raw(
        `ARRAY[${sourceTypes.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}]`
      )})`
    );
  }

  const rows = await db
    .select({
      id: schema.agentEmbeddings.id,
      sourceType: schema.agentEmbeddings.sourceType,
      sourceId: schema.agentEmbeddings.sourceId,
      sourceRef: schema.agentEmbeddings.sourceRef,
      content: schema.agentEmbeddings.content,
      metadata: schema.agentEmbeddings.metadata,
      createdAt: schema.agentEmbeddings.createdAt,
    })
    .from(schema.agentEmbeddings)
    .where(and(...filters))
    .orderBy(desc(schema.agentEmbeddings.createdAt))
    .limit(limit);

  return {
    mode: 'fulltext',
    hits: rows,
    note:
      'No embedding provider is configured, so this was a keyword search rather than ' +
      'a semantic one. Configure embeddings in Settings for better recall.',
  };
}

/** A compact, self-contained description of a run, suitable for embedding. */
export function describeExperimentForMemory(
  experiment: Experiment,
  digest: ReturnType<typeof digestExperiment>
): string {
  const config = digest.config as Record<string, unknown>;
  const custom = (experiment.customConfig ?? {}) as Record<string, unknown>;

  const strategy =
    typeof custom.strategy === 'object' && custom.strategy
      ? (custom.strategy as { name?: string }).name ?? 'custom'
      : experiment.algorithmPath
        ? 'uploaded module'
        : 'fedavg';

  const partitioner =
    typeof custom.partitioner === 'object' && custom.partitioner
      ? JSON.stringify(custom.partitioner)
      : 'iid';

  return [
    `Experiment "${experiment.name}" (${digest.outcome}).`,
    `Framework ${experiment.framework}, aggregation ${strategy}, partitioning ${partitioner}.`,
    `Configuration: ${config.numClients} clients, ${config.numRounds} rounds, ` +
      `client fraction ${config.clientFraction}, ${config.localEpochs} local epochs, ` +
      `learning rate ${config.learningRate}.`,
    digest.metrics.finalEvalAccuracy != null
      ? `Final eval accuracy ${digest.metrics.finalEvalAccuracy.toFixed(4)}, ` +
        `best ${digest.metrics.bestEvalAccuracy?.toFixed(4)} at round ${digest.metrics.bestRound}.`
      : 'No evaluation metrics were recorded.',
    digest.metrics.plateaued ? 'Accuracy plateaued before the end.' : '',
    digest.metrics.diverged ? 'Evaluation loss diverged.' : '',
    experiment.errorMessage ? `Ended with: ${experiment.errorMessage}.` : '',
    ...digest.notes,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Index one experiment. Called when a run finishes and from the reindex endpoint. */
export async function indexExperiment(experimentId: string): Promise<{ stored: boolean; reason?: string }> {
  const experiment = await getExperiment(experimentId);
  const [metrics, checkpoints] = await Promise.all([
    getMetrics(experimentId),
    getCheckpoints(experimentId),
  ]);

  const digest = digestExperiment(experiment, metrics, checkpoints);

  return remember({
    sourceType: 'experiment',
    sourceId: experimentId,
    sourceRef: experiment.name,
    content: describeExperimentForMemory(experiment, digest),
    metadata: {
      status: experiment.status,
      outcome: digest.outcome,
      finalAccuracy: digest.metrics.finalEvalAccuracy,
      createdAt: experiment.createdAt,
    },
  });
}

/** Re-index every completed experiment, e.g. after changing embedding model. */
export async function reindexAll(): Promise<{ indexed: number; skipped: number; reason?: string }> {
  const embedder = await getEmbedder();
  if (!embedder) return { indexed: 0, skipped: 0, reason: 'embeddings are not configured' };

  // Rows from a previous model can never match again; clear them out.
  await db
    .delete(schema.agentEmbeddings)
    .where(sql`${schema.agentEmbeddings.embeddingModel} <> ${embedder.model}`);

  const experiments = await db.select().from(schema.experiments);

  let indexed = 0;
  let skipped = 0;
  for (const experiment of experiments) {
    const result = await indexExperiment(experiment.id);
    if (result.stored) indexed += 1;
    else skipped += 1;
  }

  return { indexed, skipped };
}
