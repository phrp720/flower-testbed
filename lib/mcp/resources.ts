import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import {
  assertExperimentId,
  getExperimentDetail,
  listExperiments,
} from '@/lib/experiments/service';
import { digestExperiment } from '@/lib/agent/analysis';
import { PYTORCH_TEMPLATES, readPytorchTemplate } from '@/lib/templates';
import { stripAnsi, truncate, wrapUntrusted } from './untrusted';

/**
 * Resources rather than tools.
 *
 * The split is by who chooses: a human picking context in an MCP host wants
 * resources (they appear in an @-mention picker), while anything the model must
 * compute or filter belongs in a tool. Logs get both, because both apply.
 *
 * Checkpoints are exposed as metadata and a download URL only. They are pickled
 * tensors of many megabytes; inlining them would exhaust a context window and
 * tell the reader nothing.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    'experiments',
    'flower://experiments',
    {
      title: 'All experiments',
      description: 'Index of every experiment with status and final metrics.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const experiments = await listExperiments({ limit: 100 });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              experiments.map((e) => ({
                id: e.id,
                name: e.name,
                status: e.status,
                framework: e.framework,
                numClients: e.numClients,
                numRounds: e.numRounds,
                finalAccuracy: e.finalAccuracy,
                finalLoss: e.finalLoss,
                createdAt: e.createdAt,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  const experimentList = async () => {
    const experiments = await listExperiments({ limit: 100 });
    return {
      resources: experiments.map((e) => ({
        uri: `flower://experiments/${e.id}`,
        name: e.name,
        description: `${e.framework} · ${e.status} · ${e.numClients} clients × ${e.numRounds} rounds`,
        mimeType: 'application/json',
      })),
    };
  };

  server.registerResource(
    'experiment',
    new ResourceTemplate('flower://experiments/{id}', { list: experimentList }),
    {
      title: 'Experiment summary',
      description: 'Configuration, convergence summary and checkpoints for one experiment.',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      const { experiment, metrics, checkpoints } = await getExperimentDetail(
        assertExperimentId(String(id))
      );

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(digestExperiment(experiment, metrics, checkpoints), null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    'experiment-logs',
    new ResourceTemplate('flower://experiments/{id}/logs', { list: undefined }),
    {
      title: 'Experiment logs',
      description: 'Captured stdout of a finished run. Produced by user-supplied code.',
      mimeType: 'text/plain',
    },
    async (uri, { id }) => {
      const { experiment } = await getExperimentDetail(assertExperimentId(String(id)));
      const logs = experiment.logs
        ? truncate(stripAnsi(experiment.logs), { maxBytes: 64 * 1024, fromEnd: true }).text
        : 'No logs recorded. Logs are written when a run finishes.';

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: wrapUntrusted(`experiment:${experiment.id}:logs`, logs),
          },
        ],
      };
    }
  );

  server.registerResource(
    'experiment-metrics-csv',
    new ResourceTemplate('flower://experiments/{id}/metrics.csv', { list: undefined }),
    {
      title: 'Experiment metrics (CSV)',
      description: 'Per-round training and evaluation metrics.',
      mimeType: 'text/csv',
    },
    async (uri, { id }) => {
      const { metrics } = await getExperimentDetail(assertExperimentId(String(id)));
      const header = 'round,train_loss,train_accuracy,eval_loss,eval_accuracy';
      const rows = metrics.map((m) =>
        [m.round, m.trainLoss, m.trainAccuracy, m.evalLoss, m.evalAccuracy]
          .map((v) => (v == null ? '' : v))
          .join(',')
      );

      return {
        contents: [
          { uri: uri.href, mimeType: 'text/csv', text: [header, ...rows].join('\n') },
        ],
      };
    }
  );

  server.registerResource(
    'pytorch-template',
    new ResourceTemplate('flower://templates/pytorch/{filename}', {
      list: async () => ({
        resources: PYTORCH_TEMPLATES.map((filename) => ({
          uri: `flower://templates/pytorch/${filename}`,
          name: filename,
          description: `Starter template: ${filename.replace('_template.py', '')}`,
          mimeType: 'text/x-python',
        })),
      }),
    }),
    {
      title: 'PyTorch starter template',
      description: 'Reference implementation showing the contract an uploaded module must meet.',
      mimeType: 'text/x-python',
    },
    async (uri, { filename }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/x-python',
          text: await readPytorchTemplate(String(filename)),
        },
      ],
    })
  );
}
