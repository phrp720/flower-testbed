import path from 'path';
import { createHash } from 'crypto';
import { readFile, stat, writeFile } from 'fs/promises';
import { ensureDir, getDataDir, getExperimentCheckpointDir } from '@/lib/storage';
import { modelView, type ModelView } from '@/lib/python-tools';
import { getCheckpoints } from './service';

/**
 * Caching what a model looks like.
 *
 * Producing it costs about seven seconds before any real work happens: one
 * second to import torch, two for the dataset module, and two per data
 * partition loaded. Evaluating the rounds themselves is a quarter of a second
 * each. So almost all of the wait is fixed start-up, and it was being paid on
 * every page load for an answer that cannot change -- the weights are on disk
 * and the run is over.
 *
 * The key includes what the rounds are, so a run that gains a checkpoint (or is
 * re-run) misses the cache and recomputes, while a finished one is served from
 * disk immediately.
 */

function cacheDir(): string {
  return path.join(getDataDir(), '.cache', 'model-view');
}

interface ViewOptions {
  resolution?: number;
  maxSamples?: number;
  clientId?: string | null;
}

/**
 * Identifies the answer, not the request.
 *
 * Built from the checkpoints the view is derived from -- how many, and when the
 * newest was written -- so nothing stale can survive a re-run that reuses the
 * same experiment id.
 */
async function cacheKey(experimentId: string, options: ViewOptions): Promise<string | null> {
  const checkpoints = await getCheckpoints(experimentId);
  const global = checkpoints.filter((c) => !c.clientId);
  if (global.length === 0) return null;

  const directory = getExperimentCheckpointDir(experimentId);
  const newest = global[global.length - 1];

  const info = await stat(path.join(directory, path.basename(newest.filePath))).catch(() => null);
  if (!info) return null;

  const fingerprint = [
    experimentId,
    global.length,
    Math.round(info.mtimeMs),
    options.resolution ?? 'default',
    options.maxSamples ?? 'default',
    options.clientId ?? 'global',
  ].join(':');

  return createHash('sha256').update(fingerprint).digest('hex').slice(0, 32);
}

export async function getModelView(
  experimentId: string,
  options: ViewOptions = {}
): Promise<ModelView> {
  const key = await cacheKey(experimentId, options);
  const file = key ? path.join(cacheDir(), `${key}.json`) : null;

  if (file) {
    const hit = await readFile(file, 'utf-8')
      .then((text) => JSON.parse(text) as ModelView)
      .catch(() => null);
    if (hit) return hit;
  }

  const view = await modelView({ experimentId, ...options });

  // Only a real answer is worth keeping. An error is usually about the moment
  // -- a half-written checkpoint, a module that failed to import -- and caching
  // it would make a transient problem permanent.
  if (file && view.ok) {
    await ensureDir(cacheDir());
    await writeFile(file, JSON.stringify(view), 'utf-8').catch(() => {});
  }

  return view;
}
