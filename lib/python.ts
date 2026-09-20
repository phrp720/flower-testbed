import path from 'path';
import { getProjectRoot } from '@/lib/paths';

/** Locating the Python interpreter and scripts that run the Flower workers. */

export function getVenvRoot(): string {
  return process.env.VENV_PATH || path.join(getProjectRoot(), 'venv');
}

export function getPythonExecutable(): string {
  return path.join(getVenvRoot(), 'bin', 'python');
}

/** Absolute path to a script under runner/, e.g. getRunnerScript('core', 'resources.py'). */
export function getRunnerScript(...segments: string[]): string {
  return path.join(getProjectRoot(), 'runner', ...segments);
}
