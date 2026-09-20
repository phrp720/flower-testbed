import path from 'path';
import { readFile, stat } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { NotFoundError, ValidationError, toErrorResponse } from '@/lib/errors';
import { assertExperimentId, getExperiment } from '@/lib/experiments/service';
import { getProjectRoot } from '@/lib/paths';
import { getDataDir, isPathInside, type UploadType } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET - download one of an experiment's four module files.
 *
 * These were only ever reachable on disk. That was tolerable while every module
 * arrived through the upload form, since whoever uploaded one already had it --
 * but the agent writes them now, and a file you have never seen, cannot read and
 * cannot copy into the next run is not really yours.
 *
 * The path served is the one recorded on the experiment row, never anything the
 * caller supplies, and it still has to resolve inside the data directory: a row
 * is not a capability, and a stored path that points elsewhere is a bug worth
 * failing on rather than honouring.
 */

const COLUMNS = {
  algorithm: 'algorithmPath',
  model: 'modelPath',
  config: 'configPath',
  dataset: 'datasetPath',
} as const satisfies Record<UploadType, string>;

/** Rendered in the browser rather than downloaded, when asked for inline. */
const TEXT_TYPES: Record<string, string> = {
  '.py': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id, type } = await params;

    if (!(type in COLUMNS)) {
      throw new ValidationError(
        `Unknown module type "${type}". Expected one of ${Object.keys(COLUMNS).join(', ')}.`
      );
    }

    const experiment = await getExperiment(assertExperimentId(id));
    const stored = experiment[COLUMNS[type as UploadType]];

    if (!stored) throw new NotFoundError(`This experiment has no ${type} module.`);

    // The stored path is relative to the project root when DATA_DIR is unset and
    // absolute when it is set -- a contract the Python ModuleLoader and the
    // GitHub Action both rely on, so it is resolved here rather than normalised.
    const absolute = path.resolve(getProjectRoot(), stored);

    if (!isPathInside(getDataDir(), absolute)) {
      throw new NotFoundError('That module is not stored where uploads live.');
    }

    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) throw new NotFoundError('That module is no longer on disk.');

    const bytes = await readFile(absolute);
    const filename = path.basename(absolute);
    const extension = path.extname(filename).toLowerCase();
    const inline = request.nextUrl.searchParams.get('inline') === '1';

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': TEXT_TYPES[extension] ?? 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error, 'Error reading experiment module', 'Failed to read module');
  }
}
