import path from 'path';
import { mkdir } from 'fs/promises';
import { getProjectRoot } from '@/lib/paths';

/**
 * Canonical filesystem locations for the testbed.
 *
 * Everything that resolves a path on disk goes through here so there is a single
 * definition of each root. Previously getCheckpointsDir() was duplicated in three
 * places, and the traversal guards were prefix checks on the raw string, which a
 * sibling directory such as `checkpoints-data-x` satisfies.
 */

export function getCheckpointsDir(): string {
  return process.env.CHECKPOINTS_DIR || path.join(getProjectRoot(), 'checkpoints-data');
}

export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(getProjectRoot(), 'uploads');
}

/** Workspace the agent is allowed to write into. Nothing else on disk is writable. */
export function getAgentWorkspaceDir(): string {
  return process.env.AGENT_WORKSPACE_DIR || path.join(getDataDir(), 'agent-workspace');
}

export function getRunnerTemplatesDir(): string {
  return path.join(getProjectRoot(), 'runner', 'templates', 'pytorch');
}

export type UploadType = 'algorithm' | 'model' | 'config' | 'dataset';

export const UPLOAD_TYPES: UploadType[] = ['algorithm', 'model', 'config', 'dataset'];

/** `dataset` pluralises irregularly; the rest just take an `s`. */
export function getUploadSubdir(type: UploadType): string {
  return type === 'dataset' ? 'datasets' : `${type}s`;
}

export function getUploadDir(type: UploadType): string {
  return path.join(getDataDir(), getUploadSubdir(type));
}

export function getExperimentCheckpointDir(experimentId: string): string {
  return path.join(getCheckpointsDir(), `exp_${experimentId}`);
}

export async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** True when `candidate` is `root` itself or lives underneath it. */
export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedCandidate === resolvedRoot) return true;
  return resolvedCandidate.startsWith(resolvedRoot + path.sep);
}

/**
 * Join untrusted segments onto a trusted root, returning null if the result
 * escapes the root. Use this instead of a raw path.join + startsWith check:
 * it resolves `..` and normalises first, and it compares on a separator
 * boundary so a sibling directory cannot pass.
 */
export function resolveSafe(root: string, ...segments: string[]): string | null {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, ...segments);
  return isPathInside(resolvedRoot, candidate) ? candidate : null;
}

/** Scopes the agent and MCP tools may address. Enforcement lives in lib/mcp/paths.ts. */
export type StorageScope = 'uploads' | 'workspace' | 'checkpoints' | 'runner-templates';

export function getScopeRoot(scope: StorageScope): string {
  switch (scope) {
    case 'uploads':
      return getDataDir();
    case 'workspace':
      return getAgentWorkspaceDir();
    case 'checkpoints':
      return getCheckpointsDir();
    case 'runner-templates':
      return getRunnerTemplatesDir();
  }
}

/** Scopes that may be written to. Everything else is read-only for the agent. */
export const WRITABLE_SCOPES: StorageScope[] = ['workspace'];
