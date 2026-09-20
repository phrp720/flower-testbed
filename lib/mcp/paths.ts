import path from 'path';
import { readFile, readdir, stat } from 'fs/promises';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  StorageScope,
  WRITABLE_SCOPES,
  getScopeRoot,
  resolveSafe,
} from '@/lib/storage';

/**
 * Scope confinement for every filesystem tool.
 *
 * Tools address files by (scope, relative path) and never by absolute path, so
 * there is no way to express a location outside the four known roots. The
 * resolution itself goes through resolveSafe, which normalises `..` and compares
 * on a separator boundary.
 */

export const SCOPES: StorageScope[] = ['uploads', 'workspace', 'checkpoints', 'runner-templates'];

export const DEFAULT_MAX_READ_BYTES = 256 * 1024;

/** Extensions a text tool will return. Everything else is binary as far as tools go. */
const TEXT_EXTENSIONS = new Set([
  '.py', '.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.tsv',
  '.log', '.ini', '.cfg', '.toml', '.sh', '.ts', '.js',
]);

export function isScope(value: unknown): value is StorageScope {
  return typeof value === 'string' && (SCOPES as string[]).includes(value);
}

export function assertScope(value: unknown): StorageScope {
  if (!isScope(value)) {
    throw new ValidationError(`Unknown scope. Must be one of: ${SCOPES.join(', ')}`);
  }
  return value;
}

export function isWritableScope(scope: StorageScope): boolean {
  return WRITABLE_SCOPES.includes(scope);
}

export function resolveScoped(scope: StorageScope, relativePath = ''): string {
  const root = getScopeRoot(scope);
  const resolved = resolveSafe(root, relativePath);

  if (!resolved) {
    throw new ForbiddenError(
      `Path escapes the '${scope}' scope. Paths are relative to the scope root and cannot traverse outside it.`
    );
  }

  return resolved;
}

export function assertWritableScope(scope: StorageScope): void {
  if (!isWritableScope(scope)) {
    throw new ForbiddenError(
      `The '${scope}' scope is read-only. Files can only be written to: ${WRITABLE_SCOPES.join(', ')}`
    );
  }
}

export function isTextFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export interface ScopedEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
  modifiedAt?: string;
}

export async function listScoped(
  scope: StorageScope,
  subpath = '',
  options: { recursive?: boolean; limit?: number } = {}
): Promise<ScopedEntry[]> {
  const root = getScopeRoot(scope);
  const target = resolveScoped(scope, subpath);
  const limit = options.limit ?? 500;
  const entries: ScopedEntry[] = [];

  async function walk(dir: string): Promise<void> {
    if (entries.length >= limit) return;

    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      // A scope directory that has never been created yet is simply empty.
      return;
    }

    for (const dirent of dirents) {
      if (entries.length >= limit) return;
      if (dirent.name.startsWith('.') || dirent.name === '__pycache__') continue;

      const absolute = path.join(dir, dirent.name);
      const relative = path.relative(root, absolute);

      if (dirent.isDirectory()) {
        entries.push({ name: dirent.name, path: relative, type: 'directory' });
        if (options.recursive) await walk(absolute);
      } else if (dirent.isFile()) {
        const info = await stat(absolute).catch(() => null);
        entries.push({
          name: dirent.name,
          path: relative,
          type: 'file',
          sizeBytes: info?.size,
          modifiedAt: info?.mtime.toISOString(),
        });
      }
    }
  }

  await walk(target);
  return entries;
}

export interface ScopedFile {
  scope: StorageScope;
  path: string;
  sizeBytes: number;
  truncated: boolean;
  content: string;
}

export async function readScopedFile(
  scope: StorageScope,
  relativePath: string,
  maxBytes = DEFAULT_MAX_READ_BYTES
): Promise<ScopedFile> {
  const absolute = resolveScoped(scope, relativePath);

  const info = await stat(absolute).catch(() => null);
  if (!info || !info.isFile()) {
    throw new NotFoundError(`No such file in scope '${scope}': ${relativePath}`);
  }

  if (!isTextFile(absolute)) {
    throw new ValidationError(
      `'${relativePath}' is not a text file. Model checkpoints are pickled tensors -- ` +
        'use inspect_checkpoint for their structure instead of reading the bytes.'
    );
  }

  const buffer = await readFile(absolute);
  const truncated = buffer.length > maxBytes;

  return {
    scope,
    path: relativePath,
    sizeBytes: info.size,
    truncated,
    content: buffer.subarray(0, maxBytes).toString('utf-8'),
  };
}
