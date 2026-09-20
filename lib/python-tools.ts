import { execFile } from 'child_process';
import { promisify } from 'util';
import { getProjectRoot } from '@/lib/paths';
import { getPythonExecutable, getRunnerScript } from '@/lib/python';

const execFileAsync = promisify(execFile);

/**
 * Running the short-lived JSON-on-stdout helpers under runner/tools.
 *
 * These are foreground with a timeout, unlike the training worker, which is
 * detached and signals through Postgres. They print exactly one JSON line, the
 * convention runner/core/resources.py established.
 */

export interface PythonToolOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export async function runPythonTool<T>(
  script: string,
  args: string[],
  options: PythonToolOptions = {}
): Promise<T> {
  // A script name containing a separator is taken as relative to runner/,
  // which is where the longer-running entry points live.
  const scriptPath = script === 'eval_runner.py'
    ? getRunnerScript(script)
    : script.includes('/')
    ? getRunnerScript(...script.split('/'))
    : getRunnerScript('tools', script);

  const { stdout } = await execFileAsync(
    getPythonExecutable(),
    [scriptPath, ...args],
    {
      cwd: getProjectRoot(),
      timeout: options.timeoutMs ?? 30000,
      maxBuffer: options.maxBufferBytes ?? 4 * 1024 * 1024,
    }
  );

  const trimmed = stdout.trim();
  if (!trimmed) throw new Error(`${script} produced no output.`);

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Import-time noise ahead of the JSON is the usual cause; take the last line.
    const lastLine = trimmed.split('\n').filter(Boolean).pop() ?? '';
    try {
      return JSON.parse(lastLine) as T;
    } catch {
      throw new Error(`${script} did not return JSON: ${trimmed.slice(0, 300)}`);
    }
  }
}

export interface ModuleValidationResult {
  valid: boolean;
  moduleName?: string;
  path?: string;
  expected?: Record<string, string[]>;
  defines?: { functions: string[]; classes: string[]; variables: string[] };
  error?: string;
}

export const USER_MODULE_NAMES = [
  'user_model',
  'user_dataset',
  'user_algorithm',
  'user_config',
] as const;

export type UserModuleName = (typeof USER_MODULE_NAMES)[number];

export function validateUserModule(
  filePath: string,
  moduleName: UserModuleName
): Promise<ModuleValidationResult> {
  return runPythonTool<ModuleValidationResult>('validate_module.py', [filePath, moduleName]);
}

export interface CheckpointInspection {
  ok: boolean;
  path?: string;
  fileSizeBytes?: number;
  round?: number | null;
  metrics?: Record<string, number> | null;
  totalParameters?: number;
  layerCount?: number;
  layers?: Array<{
    name: string;
    shape: number[] | null;
    params: number | null;
    dtype?: string;
    absMean?: number;
  }>;
  error?: string;
}

export function inspectCheckpoint(checkpointPath: string): Promise<CheckpointInspection> {
  // Loading and walking a state dict is slower than a static parse.
  return runPythonTool<CheckpointInspection>('inspect_checkpoint.py', [checkpointPath], {
    timeoutMs: 60000,
  });
}

export interface StrategyInfo {
  ok: boolean;
  strategies?: Record<
    string,
    { class: string; parameters: Record<string, number>; needs_initial_parameters: boolean }
  >;
  error?: string;
}

export function listBuiltinStrategies(): Promise<StrategyInfo> {
  return runPythonTool<StrategyInfo>('strategy_info.py', []);
}

export interface DryRunStrategyResult {
  ok: boolean;
  strategyClass?: string;
  baseClasses?: string[];
  definesCallbacks?: Record<string, boolean>;
  warnings?: string[];
  attributes?: Record<string, number>;
  error?: string;
}

export function dryRunStrategy(filePath: string): Promise<DryRunStrategyResult> {
  return runPythonTool<DryRunStrategyResult>('dry_run_strategy.py', [filePath], {
    timeoutMs: 60000,
  });
}

export interface EvaluationResult {
  ok: boolean;
  experimentId?: string;
  round?: number;
  clientId?: string | null;
  evaluatedOnPartition?: number;
  device?: string;
  loss?: number;
  accuracy?: number;
  samples?: number;
  storedMetrics?: Record<string, number> | null;
  error?: string;
}

/**
 * Evaluating a checkpoint means a forward pass over a data partition, so this is
 * minutes-scale rather than seconds-scale.
 */
export function evaluateCheckpoint(options: {
  experimentId: string;
  round: number;
  clientId?: string | null;
  partition?: number | null;
  datasetPath?: string | null;
}): Promise<EvaluationResult> {
  const args = [options.experimentId, String(options.round)];
  if (options.clientId) args.push('--client', options.clientId);
  if (options.partition != null) args.push('--partition', String(options.partition));
  if (options.datasetPath) args.push('--dataset', options.datasetPath);

  return runPythonTool<EvaluationResult>('eval_runner.py', args, { timeoutMs: 15 * 60 * 1000 });
}
