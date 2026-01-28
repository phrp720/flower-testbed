CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"experiment_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"data_partition_size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" serial PRIMARY KEY NOT NULL,
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
	"id" serial PRIMARY KEY NOT NULL,
	"experiment_id" integer NOT NULL,
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
	"id" serial PRIMARY KEY NOT NULL,
	"experiment_id" integer NOT NULL,
	"round" integer NOT NULL,
	"file_path" text NOT NULL,
	"accuracy" real,
	"loss" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_checkpoints" ADD CONSTRAINT "model_checkpoints_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;