import type { LlmEffort } from '@/lib/llm/types';
import type { ToolGroup } from '@/lib/mcp/registry';

/**
 * Roles are modes of one loop, not separate agents.
 *
 * Four independent agents would mean four loops, four transcripts and four times
 * the token bill for what is really one conversation. What actually differs
 * between roles is the instruction block, the subset of tools in reach, and how
 * hard the model should think -- so that is all that varies.
 */

export type RoleName = 'orchestrator' | 'planner' | 'experimenter' | 'analyst' | 'engineer';

export interface RoleDefinition {
  name: RoleName;
  label: string;
  description: string;
  /** Tool groups this role may use. `null` means every group. */
  groups: ToolGroup[] | null;
  effort: LlmEffort;
  instructions: string;
}

export const ROLES: Record<RoleName, RoleDefinition> = {
  orchestrator: {
    name: 'orchestrator',
    label: 'Orchestrator',
    description: 'Default. Handles the request directly, or routes it to a specialist.',
    groups: null,
    effort: 'high',
    instructions: [
      'You are handling this request end to end. Work out what the user actually',
      'needs, gather the evidence, and answer.',
      '',
      'If a request is broad enough that it splits into distinct pieces of work,',
      'say so and work through them in order rather than attempting everything at once.',
    ].join('\n'),
  },

  planner: {
    name: 'planner',
    label: 'Planner',
    description: 'Turns a vague goal into an ordered plan, using read-only tools.',
    groups: null,
    effort: 'high',
    instructions: [
      'Your job is to turn the goal into a concrete, ordered plan.',
      '',
      'Read the current state first -- existing experiments, their results, available',
      'resources -- so the plan is grounded in what is actually there. Then lay out',
      'the steps, each with what it changes and what result would tell you it worked.',
      '',
      'Do not modify anything. Produce the plan and let the user decide.',
    ].join('\n'),
  },

  experimenter: {
    name: 'experimenter',
    label: 'Experimenter',
    description: 'Creates, configures, starts and monitors experiments.',
    groups: ['training', 'nodes', 'results'],
    effort: 'medium',
    instructions: [
      'You configure and run federated learning experiments.',
      '',
      'Before starting anything, check capacity and confirm the configuration is',
      'valid. Change one variable at a time relative to the run you are comparing',
      'against, so the result is interpretable. When waiting on a run, use',
      'wait_for_round rather than polling status in a loop.',
    ].join('\n'),
  },

  analyst: {
    name: 'analyst',
    label: 'Analyst',
    description: 'Reads results, compares runs, diagnoses what happened.',
    groups: ['results', 'memory', 'files'],
    effort: 'high',
    instructions: [
      'You interpret experiment results.',
      '',
      'Start from summarize_experiment -- convergence trend, best round, plateau and',
      'divergence detection are already computed there, and the figures are exact.',
      'Reach for raw metrics or logs only when the digest leaves a specific question open.',
      '',
      'Be careful to separate instrumentation problems from model behaviour. If a run',
      'recorded no eval metrics, that means the strategy did not report them; it is',
      'not evidence the model failed to learn, and you must not present it as such.',
      '',
      'Quote the numbers you are reasoning from. Where a conclusion is a general',
      'federated learning heuristic rather than something this data shows, say so.',
    ].join('\n'),
  },

  engineer: {
    name: 'engineer',
    label: 'Engineer',
    description: 'Writes and edits model, dataset, strategy and config modules.',
    groups: ['strategy', 'files', 'results'],
    effort: 'xhigh',
    instructions: [
      'You write the Python modules an experiment runs: model, dataset, aggregation',
      'strategy and config.',
      '',
      'Read the relevant template first. The runner validates uploaded files',
      'statically against an exact set of expected exports, so a file that defines',
      'the right logic under the wrong name is rejected before it ever runs.',
      '',
      'Always run validate_user_module on anything you write before attaching it to',
      'an experiment. A file that fails validation costs a whole training run.',
    ].join('\n'),
  },
};

export const DEFAULT_ROLE: RoleName = 'orchestrator';

export function getRole(name: string | null | undefined): RoleDefinition {
  return ROLES[(name ?? DEFAULT_ROLE) as RoleName] ?? ROLES[DEFAULT_ROLE];
}
