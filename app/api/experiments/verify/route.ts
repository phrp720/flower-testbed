import path from 'path';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { ValidationError, toErrorResponse } from '@/lib/errors';
import { dryRunStrategy, validateUserModule, type UserModuleName } from '@/lib/python-tools';
import { VALID_UPLOAD_EXTENSIONS, isUploadType } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST - check a module before it is attached to anything.
 *
 * The same checks startExperiment runs, offered while the form is still being
 * filled in. Starting a run enforces them; this is for finding out before you
 * commit, on a file that has not been uploaded yet.
 *
 * Written to a private temp directory and removed immediately, so verifying has
 * no consequence: nothing reaches the uploads tree, and a file that fails
 * leaves no trace to clean up.
 */

const MODULE_NAMES: Record<string, UserModuleName> = {
  model: 'user_model',
  dataset: 'user_dataset',
  algorithm: 'user_algorithm',
  config: 'user_config',
};

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  let workDir: string | null = null;

  try {
    const form = await request.formData();
    const file = form.get('file');
    const type = String(form.get('type') ?? '');

    if (!(file instanceof File)) throw new ValidationError('No file supplied.');
    if (!isUploadType(type)) throw new ValidationError(`Unknown module type "${type}".`);

    const extension = path.extname(file.name).toLowerCase();
    if (!VALID_UPLOAD_EXTENSIONS[type].includes(extension)) {
      throw new ValidationError(
        `${extension || 'That file type'} is not accepted for ${type}. ` +
          `Allowed: ${VALID_UPLOAD_EXTENSIONS[type].join(', ')}`
      );
    }

    // Only Python can be introspected; a .pt model or a .json config is data.
    if (extension !== '.py') {
      return NextResponse.json({
        checked: false,
        ok: true,
        reason: `${extension} files are data rather than modules, so there is nothing to import.`,
      });
    }

    workDir = await mkdtemp(path.join(tmpdir(), 'ftb-verify-'));
    const absolute = path.join(workDir, path.basename(file.name));
    await writeFile(absolute, Buffer.from(await file.arrayBuffer()));

    const structure = await validateUserModule(absolute, MODULE_NAMES[type]);

    // Structure asks whether get_strategy() exists; the dry run asks whether
    // calling it works. Only the second catches the failure that costs a run,
    // and it is only worth attempting once the shape is right.
    const dryRun =
      type === 'algorithm' && structure.valid ? await dryRunStrategy(absolute) : null;

    return NextResponse.json({
      checked: true,
      ok: structure.valid && (dryRun ? dryRun.ok : true),
      structure,
      dryRun,
    });
  } catch (error) {
    return toErrorResponse(error, 'Error verifying module', 'Failed to verify module');
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
