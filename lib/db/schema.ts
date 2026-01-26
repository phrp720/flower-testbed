import { pgTable, serial, text, integer, timestamp, real, jsonb, boolean } from 'drizzle-orm/pg-core';

// Experiments table - stores metadata about each FL experiment
export const experiments = pgTable('experiments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  framework: text('framework').notNull(), // 'pytorch', 'tensorflow', etc.
  status: text('status').notNull().default('pending'), // 'pending', 'running', 'completed', 'failed'

  // File paths
  algorithmPath: text('algorithm_path'),
  modelPath: text('model_path'),
  configPath: text('config_path'),
  datasetPath: text('dataset_path'),

  // Configuration
  numClients: integer('num_clients').notNull().default(10),
  numRounds: integer('num_rounds').notNull().default(3),
  clientFraction: real('client_fraction').notNull().default(0.5),
  localEpochs: integer('local_epochs').notNull().default(1),
  learningRate: real('learning_rate').notNull().default(0.01),

  // Resource configuration
  useGpu: boolean('use_gpu').notNull().default(false),
  cpusPerClient: integer('cpus_per_client').notNull().default(1),
  gpuFractionPerClient: real('gpu_fraction_per_client').notNull().default(0.1), // 0.1 = 10 clients per GPU

  // Additional config (stored as JSON)
  customConfig: jsonb('custom_config'),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),

  // Results
  finalAccuracy: real('final_accuracy'),
  finalLoss: real('final_loss'),
  errorMessage: text('error_message'),

  // Execution logs
  logs: text('logs'),
});

// Model checkpoints - stores model states after each round
export const modelCheckpoints = pgTable('model_checkpoints', {
  id: serial('id').primaryKey(),
  experimentId: integer('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  filePath: text('file_path').notNull(),

  // Metrics at this checkpoint
  accuracy: real('accuracy'),
  loss: real('loss'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Metrics - stores per-round metrics during training
export const metrics = pgTable('metrics', {
  id: serial('id').primaryKey(),
  experimentId: integer('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),

  // Aggregated metrics
  trainLoss: real('train_loss'),
  trainAccuracy: real('train_accuracy'),
  evalLoss: real('eval_loss'),
  evalAccuracy: real('eval_accuracy'),

  // Per-client metrics (stored as JSON array)
  clientMetrics: jsonb('client_metrics'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Client info - stores information about virtual clients
export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  experimentId: integer('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull(),

  // Client configuration
  dataPartitionSize: integer('data_partition_size'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});