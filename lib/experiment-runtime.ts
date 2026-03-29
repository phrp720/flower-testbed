import http from 'http';
import { execFile, spawn, SpawnOptions } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { db, schema } from '@/lib/db';
import { eq, or } from 'drizzle-orm';

const DOCKER_API_VERSION = 'v1.41';
const execFileAsync = promisify(execFile);
const WORKER_STARTUP_GRACE_MS = 1500;
export interface ExperimentCapacity {
  maxConcurrentExperiments: number | null;
  activeExperiments: number;
  availableSlots: number | null;
  canCreateExperiment: boolean;
}

export function getCheckpointsDir(): string {
  return process.env.CHECKPOINTS_DIR || path.join(process.cwd(), 'checkpoints-data');
}

function getContainerSocketPath(): string {
  return process.env.CONTAINER_SOCKET_PATH || '/var/run/docker.sock';
}

export function getWorkerContainerName(experimentId: string): string {
  return `flower-testbed-exp-${experimentId}`;
}

export function getExperimentPidFile(experimentId: string): string {
  return path.join(getCheckpointsDir(), `exp_${experimentId}`, 'runner.pid');
}

export function shouldUseDockerExecutor(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction
    && process.env.EXPERIMENT_EXECUTOR === 'docker'
    && existsSync(getContainerSocketPath());
}

export function getMaxConcurrentExperiments(): number | null {
  const configured = process.env.MAX_CONCURRENT_EXPERIMENTS;
  if (!configured) return null;

  const parsed = Number.parseInt(configured, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;

  return parsed;
}

export async function getExperimentCapacity(options?: {
  excludeExperimentId?: string;
}): Promise<ExperimentCapacity> {
  if (!shouldUseDockerExecutor()) {
    return {
      maxConcurrentExperiments: null,
      activeExperiments: 0,
      availableSlots: null,
      canCreateExperiment: true,
    };
  }

  const maxConcurrentExperiments = getMaxConcurrentExperiments();

  const activeExperiments = (await db
    .select({ id: schema.experiments.id })
    .from(schema.experiments)
    .where(
      or(
        eq(schema.experiments.status, 'pending'),
        eq(schema.experiments.status, 'running'),
      )
    ))
    .filter((experiment) => experiment.id !== options?.excludeExperimentId)
    .length;

  if (maxConcurrentExperiments === null) {
    return {
      maxConcurrentExperiments: null,
      activeExperiments,
      availableSlots: null,
      canCreateExperiment: true,
    };
  }

  const availableSlots = Math.max(0, maxConcurrentExperiments - activeExperiments);

  return {
    maxConcurrentExperiments,
    activeExperiments,
    availableSlots,
    canCreateExperiment: availableSlots > 0,
  };
}

export async function ensureExperimentRuntimeDirs(experimentId: string): Promise<void> {
  const checkpointDir = path.join(getCheckpointsDir(), `exp_${experimentId}`);
  await mkdir(checkpointDir, { recursive: true });
}

export async function startExperimentExecution(experimentId: string): Promise<void> {
  if (shouldUseDockerExecutor()) {
    await startDockerWorker(experimentId);
    return;
  }

  await startLocalWorker(experimentId);
}

export async function writeExperimentPid(experimentId: string, pid: number): Promise<void> {
  await writeFile(getExperimentPidFile(experimentId), `${pid}\n`, 'utf8');
}

export async function removeExperimentPid(experimentId: string): Promise<void> {
  await rm(getExperimentPidFile(experimentId), { force: true });
}

export async function stopExperimentExecution(experimentId: string): Promise<void> {
  if (shouldUseDockerExecutor()) {
    await stopDockerWorker(experimentId);
    return;
  }

  await stopLocalWorker(experimentId);
}

async function stopDockerWorker(experimentId: string): Promise<void> {
  const workerName = getWorkerContainerName(experimentId);

  try {
    await dockerRequest('POST', `/containers/${workerName}/stop?t=10`);
  } catch (error) {
    if (!isDockerNotFound(error)) {
      throw error;
    }
  }

  try {
    await dockerRequest('DELETE', `/containers/${workerName}?force=true`);
  } catch (error) {
    if (!isDockerNotFound(error)) {
      throw error;
    }
  }
}

async function stopLocalWorker(experimentId: string): Promise<void> {
  const pidFile = getExperimentPidFile(experimentId);
  if (!existsSync(pidFile)) return;

  const rawPid = await readFile(pidFile, 'utf8');
  const pid = Number.parseInt(rawPid.trim(), 10);

  if (Number.isNaN(pid) || pid <= 0) {
    await removeExperimentPid(experimentId);
    return;
  }

  const belongsToExperiment = await doesPidBelongToExperiment(pid, experimentId);
  if (!belongsToExperiment) {
    await removeExperimentPid(experimentId);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ESRCH') {
      throw error;
    }
  }

  await removeExperimentPid(experimentId);
}

async function startLocalWorker(experimentId: string): Promise<void> {
  const projectRoot = process.cwd();
  const pythonScript = path.join(projectRoot, 'runner', 'flower_runner.py');
  const pythonPath = path.join(
    process.env.VENV_PATH ?? path.join(projectRoot, 'venv'),
    'bin',
    'python'
  );
  const showLogs = process.env.SHOW_FLWR_LOGS === 'true';

  const spawnOptions: SpawnOptions = {
    cwd: projectRoot,
    detached: true,
    stdio: showLogs ? 'inherit' : 'ignore',
  };

  const pythonProcess = spawn(pythonPath, [pythonScript, experimentId], spawnOptions);

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimer);
      callback();
    };

    const startupTimer = setTimeout(() => {
      settle(resolve);
    }, WORKER_STARTUP_GRACE_MS);

    pythonProcess.once('error', (error) => {
      settle(() => reject(error));
    });

    pythonProcess.once('exit', (code, signal) => {
      settle(() => {
        reject(
          new Error(
            `Flower runner exited during startup (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
          )
        );
      });
    });
  });

  pythonProcess.unref();
  await writeExperimentPid(experimentId, pythonProcess.pid!);
}

async function startDockerWorker(experimentId: string): Promise<void> {
  const currentContainerId = process.env.HOSTNAME;
  if (!currentContainerId) {
    throw new Error('Docker executor requires HOSTNAME to be set to the current container ID.');
  }

  const currentContainer = await dockerRequest<DockerContainerInspectResponse>(
    'GET',
    `/containers/${currentContainerId}/json`
  );

  const image = currentContainer.Config.Image;
  if (!image) {
    throw new Error('Failed to determine the current container image for worker execution.');
  }

  const workerName = getWorkerContainerName(experimentId);
  const env = buildWorkerEnv();
  const command = ['python', 'runner/flower_runner.py', experimentId];

  const createResponse = await dockerRequest<DockerContainerCreateResponse>(
    'POST',
    `/containers/create?name=${encodeURIComponent(workerName)}`,
    {
      Image: image,
      Cmd: command,
      WorkingDir: '/app',
      Env: env,
      Labels: {
        'flower-testbed.worker': 'true',
        'flower-testbed.experiment-id': experimentId,
      },
      HostConfig: {
        AutoRemove: true,
        VolumesFrom: [`${currentContainerId}:rw`],
        NetworkMode: `container:${currentContainerId}`,
        ShmSize: 1024 * 1024 * 1024,
        PidsLimit: 4096,
        Ulimits: [
          { Name: 'nofile', Soft: 65536, Hard: 65536 },
          { Name: 'nproc', Soft: 65535, Hard: 65535 },
        ],
      },
    }
  );

  const workerId = createResponse.Id;
  await dockerRequest('POST', `/containers/${workerId}/start`);
  await waitForWorkerStartup(workerId);
}

function buildWorkerEnv(): string[] {
  const keys = [
    'DATABASE_URL',
    'CHECKPOINTS_DIR',
    'DATA_DIR',
    'HF_HOME',
    'SHOW_FLWR_LOGS',
    'RAY_NUM_CPUS',
    'OMP_NUM_THREADS',
    'MKL_NUM_THREADS',
    'OPENBLAS_NUM_THREADS',
    'NUMEXPR_NUM_THREADS',
    'VECLIB_MAXIMUM_THREADS',
    'PYTHONWARNINGS',
    'HF_HUB_DISABLE_PROGRESS_BARS',
    'TOKENIZERS_PARALLELISM',
    'RAY_ACCEL_ENV_VAR_OVERRIDE_ON_ZERO',
    'RAY_IGNORE_UNHANDLED_ERRORS',
    'RAY_DEDUP_LOGS',
    'RAY_COLOR_PREFIX',
    'RAY_LOG_TO_STDERR',
  ];

  return keys
    .map((key) => {
      const value = process.env[key];
      return value === undefined ? null : `${key}=${value}`;
    })
    .filter((value): value is string => value !== null);
}

async function waitForWorkerStartup(containerId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, WORKER_STARTUP_GRACE_MS));

  const inspection = await dockerRequest<DockerContainerInspectResponse>(
    'GET',
    `/containers/${containerId}/json`
  );

  if (inspection.State.Running) {
    return;
  }

  const logs = await dockerRequestText(
    'GET',
    `/containers/${containerId}/logs?stdout=1&stderr=1&tail=50`
  );

  throw new Error(
    `Worker container exited during startup (code=${inspection.State.ExitCode ?? 'null'}). ${stripDockerLogHeaders(logs).trim()}`
  );
}

async function doesPidBelongToExperiment(pid: number, experimentId: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ps', ['-o', 'command=', '-p', String(pid)]);
    const command = stdout.trim();
    return command.includes('runner/flower_runner.py') && command.includes(String(experimentId));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException & { stdout?: string };
    if (nodeError.code === 'ESRCH') {
      return false;
    }
    return false;
  }
}

async function dockerRequest<T = unknown>(
  method: string,
  apiPath: string,
  body?: unknown,
): Promise<T> {
  const text = await dockerRequestText(method, apiPath, body);
  return text ? JSON.parse(text) as T : ({} as T);
}

async function dockerRequestText(method: string, apiPath: string, body?: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);

    const request = http.request(
      {
        socketPath: getContainerSocketPath(),
        path: `/${DOCKER_API_VERSION}${apiPath}`,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (response) => {
        let data = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(new DockerApiError(method, apiPath, response.statusCode ?? 500, data));
            return;
          }
          resolve(data);
        });
      }
    );

    request.on('error', reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

function stripDockerLogHeaders(logs: string): string {
  return logs.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ');
}

function isDockerNotFound(error: unknown): boolean {
  return error instanceof DockerApiError && error.statusCode === 404;
}

class DockerApiError extends Error {
  constructor(
    method: string,
    apiPath: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`Docker API ${method} ${apiPath} failed (${statusCode}): ${responseBody}`);
  }
}

interface DockerContainerCreateResponse {
  Id: string;
}

interface DockerContainerInspectResponse {
  Config: {
    Image: string;
  };
  State: {
    Running: boolean;
    ExitCode?: number;
  };
}
