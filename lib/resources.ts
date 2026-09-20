import os from 'os';
import { spawn } from 'child_process';
import { getExperimentCapacity } from '@/lib/experiment-runtime';
import { getPythonExecutable, getRunnerScript } from '@/lib/python';
import { getProjectRoot } from '@/lib/paths';

/**
 * System resource discovery.
 *
 * runner/core/resources.py is the only machine-readable stdout surface in the
 * Python layer -- run as __main__ it prints a single JSON line. Everything else
 * in the runner signals through Postgres.
 */

export interface SystemResources {
  cpu: { count: number; ray_count: number };
  gpu: {
    available: boolean;
    count: number;
    devices: Array<{ id: number; name: string; memory_gb: number | null }>;
    backend: string | null;
  };
}

export interface ResourceSnapshot extends SystemResources {
  concurrency: {
    max: number | null;
    active: number;
    available: number | null;
    canCreate: boolean;
  };
}

/** Ray's usable CPU budget: the visible count, capped by RAY_NUM_CPUS when set. */
export function getEffectiveRayCpuCount(): number {
  const visibleCpus = os.cpus().length || 1;
  const configured = process.env.RAY_NUM_CPUS;

  if (!configured) return visibleCpus;

  const parsed = Number.parseInt(configured, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return visibleCpus;

  return Math.min(visibleCpus, parsed);
}

export function getSystemResources(): Promise<SystemResources> {
  return new Promise((resolve, reject) => {
    const projectRoot = getProjectRoot();
    const scriptPath = getRunnerScript('core', 'resources.py');
    const pythonProcess = spawn(getPythonExecutable(), [scriptPath], { cwd: projectRoot });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          reject(new Error(`Failed to parse resources: ${stdout}`));
        }
      } else {
        reject(new Error(`Python script failed: ${stderr}`));
      }
    });

    pythonProcess.on('error', reject);
  });
}

export async function readResourceSnapshot(): Promise<ResourceSnapshot> {
  const [resources, concurrency] = await Promise.all([
    getSystemResources(),
    getExperimentCapacity(),
  ]);

  return {
    ...resources,
    concurrency: {
      max: concurrency.maxConcurrentExperiments,
      active: concurrency.activeExperiments,
      available: concurrency.availableSlots,
      canCreate: concurrency.canCreateExperiment,
    },
  };
}
