import type { AnyToolDescriptor } from '@/lib/mcp/registry';

/**
 * Plain-language previews for the approval card.
 *
 * The card has to show the user what they are actually agreeing to. A raw JSON
 * payload does not do that, so each mutating tool gets a sentence describing its
 * real-world effect. The raw payload stays available underneath -- an injected
 * call should look obviously wrong there.
 */

type Input = Record<string, unknown>;

function str(input: Input, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

function num(input: Input, key: string): number | undefined {
  const value = input[key];
  return typeof value === 'number' ? value : undefined;
}

export function buildPreviewSummary(tool: AnyToolDescriptor, rawInput: unknown): string {
  const input = (rawInput ?? {}) as Input;

  switch (tool.name) {
    case 'create_experiment': {
      const parts = [`Create experiment "${str(input, 'name') ?? 'untitled'}"`];
      const clients = num(input, 'numClients');
      const rounds = num(input, 'numRounds');
      if (clients != null || rounds != null) {
        parts.push(`${clients ?? 10} clients x ${rounds ?? 3} rounds`);
      }
      const lr = num(input, 'learningRate');
      if (lr != null) parts.push(`lr ${lr}`);
      return parts.join(', ');
    }

    case 'clone_experiment':
      return `Copy experiment ${str(input, 'experimentId') ?? ''} into a new run "${
        str(input, 'name') ?? 'untitled'
      }"`;

    case 'start_experiment':
      return `Start training experiment ${str(input, 'experimentId') ?? ''}. This consumes compute.`;

    case 'stop_experiment':
      return `Stop experiment ${str(input, 'experimentId') ?? ''} before it finishes`;

    case 'delete_experiment':
      return `Permanently delete experiment ${
        str(input, 'experimentId') ?? ''
      }, along with its metrics and checkpoints`;

    case 'update_experiment_config':
      return `Change the configuration of experiment ${str(input, 'experimentId') ?? ''}`;

    case 'write_file':
    case 'write_strategy_file':
      return `Write ${str(input, 'path') ?? str(input, 'filename') ?? 'a file'} into the agent workspace`;

    case 'edit_file':
      return `Edit ${str(input, 'path') ?? 'a file'} in the agent workspace`;

    default:
      return `${tool.title}`;
  }
}

/** Unified diff, computed server-side so the client needs no diff library. */
export function buildUnifiedDiff(
  filePath: string,
  before: string | null,
  after: string
): string {
  const beforeLines = before == null ? [] : before.split('\n');
  const afterLines = after.split('\n');

  const lines = [
    `--- ${before == null ? '/dev/null' : filePath}`,
    `+++ ${filePath}`,
  ];

  // A line-by-line comparison is enough for the card: these are whole-file
  // writes, and the user is judging intent, not reviewing a patch series.
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i += 1) {
    const oldLine = beforeLines[i];
    const newLine = afterLines[i];

    if (oldLine === newLine) {
      lines.push(` ${oldLine ?? ''}`);
    } else {
      if (oldLine !== undefined) lines.push(`-${oldLine}`);
      if (newLine !== undefined) lines.push(`+${newLine}`);
    }
  }

  return lines.join('\n');
}
