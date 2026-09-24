import path from 'path';
import { dryRunStrategy, validateUserModule, type UserModuleName } from '@/lib/python-tools';
import type { Experiment } from './service';

/**
 * Checking uploaded modules before they cost a training run.
 *
 * Two checks, in order of what they catch. `validate_module` reads the file's
 * structure -- does it define get_strategy, load_data, get_model -- and
 * `dry_run_strategy` goes further for a strategy by importing it in a
 * subprocess and calling the factory, which is the only way to find out that
 * the thing it returns cannot actually be constructed.
 *
 * Both already existed and were reachable only through the agent's tools. That
 * left the ordinary upload path with no way to learn a file was wrong until a
 * run failed -- and, before strategy failures became fatal, not even then.
 */

const MODULE_NAMES = {
  model: 'user_model',
  dataset: 'user_dataset',
  algorithm: 'user_algorithm',
  config: 'user_config',
} as const satisfies Record<string, UserModuleName>;

export interface ModuleProblem {
  type: keyof typeof MODULE_NAMES;
  filename: string;
  problem: string;
}

/** Only Python can be imported; a .pt model or a .json config is data. */
function isPython(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.py';
}

/**
 * Every problem found, rather than the first.
 *
 * Someone who uploaded three broken modules should learn that in one go, not
 * across three failed starts.
 */
export async function verifyExperimentModules(experiment: Experiment): Promise<ModuleProblem[]> {
  const slots: Array<[keyof typeof MODULE_NAMES, string | null]> = [
    ['model', experiment.modelPath],
    ['dataset', experiment.datasetPath],
    ['algorithm', experiment.algorithmPath],
    ['config', experiment.configPath],
  ];

  const problems: ModuleProblem[] = [];

  for (const [type, filePath] of slots) {
    if (!filePath || !isPython(filePath)) continue;

    const filename = path.basename(filePath);

    try {
      const structure = await validateUserModule(filePath, MODULE_NAMES[type]);
      if (!structure.valid) {
        problems.push({
          type,
          filename,
          problem: structure.error ?? 'The module does not define what this slot requires.',
        });
        // No point importing something whose shape is already wrong.
        continue;
      }

      if (type === 'algorithm') {
        const dryRun = await dryRunStrategy(filePath);
        if (!dryRun.ok) {
          problems.push({
            type,
            filename,
            problem: dryRun.error ?? 'The strategy could not be constructed.',
          });
        }
      }
    } catch (error) {
      // A checker that cannot run is not evidence the module is broken, and
      // blocking a run on our own tooling failing would be the wrong trade.
      console.warn(`[verify] Could not check ${filename}:`, error);
    }
  }

  return problems;
}

export function describeProblems(problems: ModuleProblem[]): string {
  const lines = problems.map((p) => `• ${p.filename} (${p.type}): ${p.problem}`);
  return [
    problems.length === 1
      ? 'An uploaded module failed its check, so the run was not started:'
      : `${problems.length} uploaded modules failed their checks, so the run was not started:`,
    ...lines,
  ].join('\n');
}
