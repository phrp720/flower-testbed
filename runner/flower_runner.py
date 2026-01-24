#!/usr/bin/env python3
"""
Flower Experiment Runner
Executes federated learning experiments and reports metrics back to the database.
"""

import sys
import os
import json
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
import importlib.util

import psycopg2
from psycopg2.extras import RealDictCursor
import torch
import flwr as fl
from flwr.common import Metrics
from flwr.server.strategy import FedAvg

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


class ExperimentRunner:
    """Manages the execution of a Flower federated learning experiment."""

    def __init__(self, experiment_id: int):
        self.experiment_id = experiment_id
        self.conn = None
        self.experiment_config = None
        self.checkpoint_dir = PROJECT_ROOT / "checkpoints-data" / f"exp_{experiment_id}"
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    def connect_db(self):
        """Connect to PostgreSQL database."""
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            raise ValueError("DATABASE_URL not set")

        # Remove schema parameter if present (Prisma/Drizzle-specific, not supported by psycopg2)
        if "?schema=" in db_url:
            db_url = db_url.split("?schema=")[0]
        elif "&schema=" in db_url:
            db_url = db_url.replace("&schema=public", "").replace("&schema=", "")

        self.conn = psycopg2.connect(db_url)
        print(f"✓ Connected to database")

    def load_experiment_config(self):
        """Load experiment configuration from database."""
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM experiments WHERE id = %s",
                (self.experiment_id,)
            )
            self.experiment_config = dict(cur.fetchone())

        if not self.experiment_config:
            raise ValueError(f"Experiment {self.experiment_id} not found")

        print(f"✓ Loaded experiment config: {self.experiment_config['name']}")
        return self.experiment_config

    def update_status(self, status: str, error_message: Optional[str] = None):
        """Update experiment status in database."""
        with self.conn.cursor() as cur:
            if status == "completed":
                cur.execute(
                    "UPDATE experiments SET status = %s, completed_at = %s WHERE id = %s",
                    (status, datetime.now(), self.experiment_id)
                )
            elif status == "failed":
                cur.execute(
                    "UPDATE experiments SET status = %s, error_message = %s, completed_at = %s WHERE id = %s",
                    (status, error_message, datetime.now(), self.experiment_id)
                )
            else:
                cur.execute(
                    "UPDATE experiments SET status = %s WHERE id = %s",
                    (status, self.experiment_id)
                )
            self.conn.commit()

    def save_metrics(self, round_num: int, metrics: Dict[str, Any]):
        """Save metrics for a specific round."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO metrics (experiment_id, round, train_loss, train_accuracy,
                                     eval_loss, eval_accuracy, client_metrics, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    self.experiment_id,
                    round_num,
                    metrics.get("train_loss"),
                    metrics.get("train_accuracy"),
                    metrics.get("eval_loss"),
                    metrics.get("eval_accuracy"),
                    json.dumps(metrics.get("client_metrics", [])),
                    datetime.now(),
                )
            )
            self.conn.commit()
        print(f"  ✓ Saved metrics for round {round_num}")

    def save_checkpoint(self, round_num: int, model_state: Dict, metrics: Dict[str, float]):
        """Save model checkpoint for a specific round."""
        checkpoint_path = self.checkpoint_dir / f"round_{round_num}.pt"

        # Save PyTorch model state
        torch.save({
            'round': round_num,
            'model_state_dict': model_state,
            'metrics': metrics,
        }, checkpoint_path)

        # Record in database
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_checkpoints (experiment_id, round, file_path, accuracy, loss, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    self.experiment_id,
                    round_num,
                    str(checkpoint_path.relative_to(PROJECT_ROOT)),
                    metrics.get("accuracy"),
                    metrics.get("loss"),
                    datetime.now(),
                )
            )
            self.conn.commit()

        print(f"  ✓ Saved checkpoint for round {round_num}: {checkpoint_path.name}")

    def load_user_module(self, file_path: str, module_name: str):
        """Dynamically load a Python module from file path."""
        if not file_path:
            return None

        full_path = PROJECT_ROOT / file_path
        if not full_path.exists():
            print(f"  ⚠ File not found: {file_path}")
            return None

        spec = importlib.util.spec_from_file_location(module_name, full_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

        print(f"  ✓ Loaded module: {file_path}")
        return module

    def run_flower_simulation(self):
        """Run the Flower federated learning simulation."""
        config = self.experiment_config

        print(f"\n{'='*60}")
        print(f"Starting Flower Simulation")
        print(f"{'='*60}")
        print(f"Experiment ID: {self.experiment_id}")
        print(f"Framework: {config['framework']}")
        print(f"Clients: {config['num_clients']}")
        print(f"Rounds: {config['num_rounds']}")
        print(f"Learning Rate: {config['learning_rate']}")
        print(f"{'='*60}\n")

        # Load user-provided algorithm module
        algorithm_module = None
        if config.get('algorithm_path'):
            algorithm_module = self.load_user_module(config['algorithm_path'], 'user_algorithm')

        # Create a simple strategy with callbacks
        def fit_metrics_aggregation_fn(metrics_list):
            """Aggregate fit metrics from clients."""
            if not metrics_list:
                return {}

            # Calculate average metrics
            total_examples = sum([m[0] for m in metrics_list])
            aggregated = {}

            for num_examples, metrics in metrics_list:
                for key, value in metrics.items():
                    if key not in aggregated:
                        aggregated[key] = 0.0
                    aggregated[key] += value * (num_examples / total_examples)

            return aggregated

        def evaluate_metrics_aggregation_fn(metrics_list):
            """Aggregate evaluation metrics from clients."""
            if not metrics_list:
                return {}

            total_examples = sum([m[0] for m in metrics_list])
            aggregated = {}

            for num_examples, metrics in metrics_list:
                for key, value in metrics.items():
                    if key not in aggregated:
                        aggregated[key] = 0.0
                    aggregated[key] += value * (num_examples / total_examples)

            return aggregated

        # Create strategy
        strategy = FedAvg(
            fraction_fit=config['client_fraction'],
            fraction_evaluate=config['client_fraction'],
            min_fit_clients=max(1, int(config['num_clients'] * config['client_fraction'])),
            min_evaluate_clients=max(1, int(config['num_clients'] * config['client_fraction'])),
            min_available_clients=config['num_clients'],
            fit_metrics_aggregation_fn=fit_metrics_aggregation_fn,
            evaluate_metrics_aggregation_fn=evaluate_metrics_aggregation_fn,
        )

        # Placeholder for now - we'll implement actual client function later
        # For MVP, we'll just run a simple simulation and save dummy metrics
        print("⚠ Running in dummy mode (client implementation pending)")
        print("  Simulating federated rounds with placeholder metrics...\n")

        for round_num in range(1, config['num_rounds'] + 1):
            print(f"Round {round_num}/{config['num_rounds']}")

            # Simulate metrics (replace with actual FL later)
            import random
            train_loss = 2.0 - (round_num * 0.3) + random.uniform(-0.1, 0.1)
            eval_loss = 2.1 - (round_num * 0.28) + random.uniform(-0.1, 0.1)
            train_acc = 0.3 + (round_num * 0.15) + random.uniform(-0.05, 0.05)
            eval_acc = 0.28 + (round_num * 0.14) + random.uniform(-0.05, 0.05)

            metrics = {
                "train_loss": max(0.1, train_loss),
                "train_accuracy": min(0.95, max(0.1, train_acc)),
                "eval_loss": max(0.1, eval_loss),
                "eval_accuracy": min(0.95, max(0.1, eval_acc)),
                "client_metrics": [
                    {"client_id": i, "loss": train_loss + random.uniform(-0.2, 0.2)}
                    for i in range(config['num_clients'])
                ]
            }

            self.save_metrics(round_num, metrics)

            # Save checkpoint
            # For now, create a dummy model state
            dummy_model_state = {
                f"layer_{i}": torch.randn(10, 10) for i in range(3)
            }
            self.save_checkpoint(
                round_num,
                dummy_model_state,
                {"loss": metrics["eval_loss"], "accuracy": metrics["eval_accuracy"]}
            )

            print(f"  Train Loss: {metrics['train_loss']:.4f} | Acc: {metrics['train_accuracy']:.4f}")
            print(f"  Eval Loss: {metrics['eval_loss']:.4f} | Acc: {metrics['eval_accuracy']:.4f}\n")

        # Update final metrics
        final_metrics = metrics
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE experiments SET final_accuracy = %s, final_loss = %s WHERE id = %s",
                (final_metrics['eval_accuracy'], final_metrics['eval_loss'], self.experiment_id)
            )
            self.conn.commit()

        print(f"{'='*60}")
        print(f"Experiment Completed!")
        print(f"Final Accuracy: {final_metrics['eval_accuracy']:.4f}")
        print(f"Final Loss: {final_metrics['eval_loss']:.4f}")
        print(f"{'='*60}\n")

    def run(self):
        """Execute the complete experiment workflow."""
        try:
            # Setup
            self.connect_db()
            self.load_experiment_config()
            self.update_status("running")

            # Run simulation
            self.run_flower_simulation()

            # Complete
            self.update_status("completed")
            print("✓ Experiment completed successfully!")

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"\n✗ Experiment failed: {error_msg}")
            if self.conn:
                self.update_status("failed", error_msg)
            raise

        finally:
            if self.conn:
                self.conn.close()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Run a Flower federated learning experiment")
    parser.add_argument("experiment_id", type=int, help="Experiment ID from database")
    args = parser.parse_args()

    # Load environment variables
    from dotenv import load_dotenv
    env_path = PROJECT_ROOT / ".env.local"
    load_dotenv(env_path)

    # Run experiment
    runner = ExperimentRunner(args.experiment_id)
    runner.run()


if __name__ == "__main__":
    main()