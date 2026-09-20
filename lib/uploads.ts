import path from 'path';
import { writeFile } from 'fs/promises';
import { ValidationError } from '@/lib/errors';
import { getProjectRoot } from '@/lib/paths';
import {
  UPLOAD_TYPES,
  UploadType,
  ensureDir,
  getDataDir,
  getUploadDir,
  getUploadSubdir,
} from '@/lib/storage';

/**
 * Persisting an uploaded experiment file.
 *
 * The returned `path` is stored verbatim in experiments.{algorithm,model,config,dataset}_path
 * and later resolved by the Python ModuleLoader, so its shape is a contract:
 * relative to the project root when DATA_DIR is unset, absolute when it is set.
 * The GitHub Action depends on this too -- do not "normalise" it.
 */

export const VALID_UPLOAD_EXTENSIONS: Record<UploadType, string[]> = {
  algorithm: ['.py'],
  model: ['.py', '.pt', '.pth', '.h5', '.pkl'],
  config: ['.py', '.json', '.yaml', '.yml'],
  dataset: ['.py'],
};

export interface PersistedUpload {
  filename: string;
  path: string;
  size: number;
  type: UploadType;
}

export function isUploadType(value: unknown): value is UploadType {
  return typeof value === 'string' && (UPLOAD_TYPES as string[]).includes(value);
}

export function assertUploadType(value: unknown): UploadType {
  if (!isUploadType(value)) {
    throw new ValidationError(
      `Invalid file type. Must be one of: ${UPLOAD_TYPES.join(', ')}`
    );
  }
  return value;
}

export function assertUploadExtension(filename: string, type: UploadType): void {
  const ext = path.extname(filename).toLowerCase();
  const allowed = VALID_UPLOAD_EXTENSIONS[type];
  if (!allowed.includes(ext)) {
    throw new ValidationError(
      `Invalid file extension for ${type}. Expected: ${allowed.join(', ')}`
    );
  }
}

export async function persistUpload(
  buffer: Buffer,
  originalName: string,
  type: UploadType
): Promise<PersistedUpload> {
  assertUploadExtension(originalName, type);

  const subdir = getUploadSubdir(type);
  const uploadDir = await ensureDir(getUploadDir(type));

  // Timestamp prefix: uploads happen before the experiment exists, so there is
  // no experiment id available to scope the name with.
  const filename = `${Date.now()}_${originalName}`;
  await writeFile(path.join(uploadDir, filename), buffer);

  const dataDir = getDataDir();
  const isDefaultPath = dataDir === path.join(getProjectRoot(), 'uploads');
  const storedPath = isDefaultPath
    ? path.join('uploads', subdir, filename)
    : path.join(dataDir, subdir, filename);

  return { filename, path: storedPath, size: buffer.length, type };
}
