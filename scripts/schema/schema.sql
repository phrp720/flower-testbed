CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"client_id" integer NOT NULL,
	"data_partition_size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"framework" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"algorithm_path" text,
	"model_path" text,
	"config_path" text,
	"dataset_path" text,
	"num_clients" integer DEFAULT 10 NOT NULL,
	"num_rounds" integer DEFAULT 3 NOT NULL,
	"client_fraction" real DEFAULT 0.5 NOT NULL,
	"local_epochs" integer DEFAULT 1 NOT NULL,
	"learning_rate" real DEFAULT 0.01 NOT NULL,
	"use_gpu" boolean DEFAULT false NOT NULL,
	"cpus_per_client" integer DEFAULT 1 NOT NULL,
	"gpu_fraction_per_client" real DEFAULT 0.1 NOT NULL,
	"custom_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"final_accuracy" real,
	"final_loss" real,
	"error_message" text,
	"logs" text
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"train_loss" real,
	"train_accuracy" real,
	"eval_loss" real,
	"eval_accuracy" real,
	"client_metrics" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"file_path" text NOT NULL,
	"client_id" text,
	"accuracy" real,
	"loss" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text DEFAULT 'read' NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"tool_call_id" uuid,
	"experiment_id" uuid,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"relative_path" text NOT NULL,
	"language" text DEFAULT 'python',
	"content_hash" text,
	"size_bytes" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"auto_run" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"experiment_id" uuid,
	"provider" text,
	"model" text,
	"summary" text,
	"error_message" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"source_ref" text,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"embedding_model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"kind" text DEFAULT 'chat' NOT NULL,
	"content" jsonb NOT NULL,
	"provider_raw" jsonb,
	"provider_name" text,
	"model" text,
	"stop_reason" text,
	"stop_details" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_creation_tokens" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settings_key" text DEFAULT 'default' NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"base_url" text,
	"api_key_ciphertext" text,
	"api_key_hint" text,
	"model" text DEFAULT 'claude-opus-5' NOT NULL,
	"max_tokens" integer DEFAULT 16000 NOT NULL,
	"effort" text DEFAULT 'high' NOT NULL,
	"temperature" real,
	"disable_parallel_tool_calls" boolean DEFAULT false NOT NULL,
	"system_prompt_override" text,
	"embedding_provider" text DEFAULT 'none' NOT NULL,
	"embedding_base_url" text,
	"embedding_api_key_ciphertext" text,
	"embedding_api_key_hint" text,
	"embedding_model" text,
	"embedding_dimensions" integer DEFAULT 1536 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"tool_use_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"risk_level" text DEFAULT 'read' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"preview_summary" text,
	"preview_diff" text,
	"result_content" jsonb,
	"is_error" boolean DEFAULT false NOT NULL,
	"decision_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"client_id" text,
	"dataset_path" text,
	"split" text DEFAULT 'test',
	"loss" real,
	"accuracy" real,
	"extra_metrics" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_checkpoints" ADD CONSTRAINT "model_checkpoints_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_tool_call_id_agent_tool_calls_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "public"."agent_tool_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_supersedes_id_agent_artifacts_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."agent_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_api_tokens_hash_idx" ON "agent_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "agent_artifacts_conversation_idx" ON "agent_artifacts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_updated_idx" ON "agent_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "agent_embeddings_embedding_idx" ON "agent_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "agent_embeddings_source_idx" ON "agent_embeddings" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_messages_conversation_seq_idx" ON "agent_messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_settings_key_idx" ON "agent_settings" USING btree ("settings_key");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_conversation_idx" ON "agent_tool_calls" USING btree ("conversation_id","status");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_message_idx" ON "agent_tool_calls" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "evaluation_runs_experiment_idx" ON "evaluation_runs" USING btree ("experiment_id","round");