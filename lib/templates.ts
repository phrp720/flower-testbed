import path from 'path';
import { readFile } from 'fs/promises';
import { NotFoundError } from '@/lib/errors';
import { getRunnerTemplatesDir } from '@/lib/storage';

/**
 * The four PyTorch starter templates. This allowlist is the only thing standing
 * between the templates route and arbitrary file reads, so it is an exact-match
 * list rather than a path check.
 */
export const PYTORCH_TEMPLATES = [
  'model_template.py',
  'dataset_template.py',
  'strategy_template.py',
  'config_template.py',
] as const;

export type PytorchTemplate = (typeof PYTORCH_TEMPLATES)[number];

export function isPytorchTemplate(name: string): name is PytorchTemplate {
  return (PYTORCH_TEMPLATES as readonly string[]).includes(name);
}

export async function readPytorchTemplate(name: string): Promise<string> {
  if (!isPytorchTemplate(name)) {
    throw new NotFoundError('Template not found');
  }
  return readFile(path.join(getRunnerTemplatesDir(), name), 'utf-8');
}

/**
 * What an uploaded module must export to pass the runner's AST validation
 * (runner/core/module_loader.py). Surfaced to the agent so it can generate
 * valid files instead of guessing.
 */
export const USER_MODULE_CONTRACT = {
  algorithm: {
    template: 'strategy_template.py',
    moduleName: 'user_algorithm',
    requires: 'def get_strategy() -> Strategy  (called with zero arguments)',
  },
  model: {
    template: 'model_template.py',
    moduleName: 'user_model',
    requires: 'def get_model() -> nn.Module, or a top-level class named Net or Model',
  },
  dataset: {
    template: 'dataset_template.py',
    moduleName: 'user_dataset',
    requires:
      'def load_data(partition_id, num_partitions, batch_size=32) -> (trainloader, testloader); ' +
      'called positionally with exactly two arguments, so batch_size must stay defaulted',
  },
  config: {
    template: 'config_template.py',
    moduleName: 'user_config',
    requires:
      'a top-level CONFIG (or config) dict. Note get_config() satisfies the AST ' +
      'validator but is never called, so a file defining only get_config yields {}',
  },
} as const;
