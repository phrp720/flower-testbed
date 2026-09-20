import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';

/**
 * Prompts surface as slash-commands in an MCP host such as Claude Desktop or
 * Claude Code, giving a user a one-step way into the workflows that would
 * otherwise need a paragraph of instruction.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'analyze-experiment',
    {
      title: 'Analyze an experiment',
      description: 'Diagnose how a federated learning run went and why.',
      argsSchema: z.object({
        experimentId: z.string().describe('Experiment UUID (see list_experiments).'),
      }),
    },
    ({ experimentId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Analyze federated learning experiment ${experimentId}.`,
              '',
              'Start with summarize_experiment; it already computes convergence trend,',
              'best round, plateau and divergence detection, and flags anything that',
              'would mislead a naive reading. Only reach for get_metrics or',
              'read_experiment_logs if the digest leaves a specific question open.',
              '',
              'Cover: whether it converged, how the global model behaved round to round,',
              'anything anomalous, and what the configuration implies about the result.',
              '',
              'If no eval metrics were recorded, treat that as an instrumentation problem',
              'rather than evidence the model failed to learn.',
            ].join('\n'),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'improve-experiment',
    {
      title: 'Propose an improved variant',
      description: 'Suggest a concrete next experiment based on what a previous run showed.',
      argsSchema: z.object({
        experimentId: z.string().describe('The experiment to improve on.'),
        goal: z
          .string()
          .optional()
          .describe('What to optimise for, e.g. "higher accuracy" or "faster convergence".'),
      }),
    },
    ({ experimentId, goal }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Propose an improved variant of experiment ${experimentId}${
                goal ? `, optimising for ${goal}` : ''
              }.`,
              '',
              'Read its configuration and results first. Then propose one concrete',
              'change at a time, with the reason it should help and what result would',
              'confirm or refute it. Prefer changing a single variable so the comparison',
              'stays interpretable.',
              '',
              'Say plainly which of your suggestions are grounded in this run\'s data and',
              'which are general federated learning heuristics.',
            ].join('\n'),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'explain-failure',
    {
      title: 'Explain a failed run',
      description: 'Work out why an experiment failed and how to fix it.',
      argsSchema: z.object({
        experimentId: z.string().describe('The failed experiment.'),
      }),
    },
    ({ experimentId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Experiment ${experimentId} failed. Work out why.`,
              '',
              'Check its status and error message, then read the logs with a grep for',
              'the error before pulling the whole thing in.',
              '',
              'Two things to rule out first: a run stopped by the user is recorded as',
              'status "failed" with errorMessage "Stopped by user" and is not a failure;',
              'and an uploaded module that does not export what the runner expects fails',
              'at load time, which validate_user_module will confirm.',
              '',
              'Finish with the specific fix, not a list of possibilities.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
