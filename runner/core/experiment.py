"""
ExperimentManager - Handles database operations for experiments.
"""

import os
import json
from typing import Dict, Any, Optional
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor


class ExperimentManager:
    """Manages database operations for a Flower federated learning experiment."""

    def __init__(self, experiment_id: int, project_root: Path):
        self.experiment_id = experiment_id
        self.project_root = project_root
        self.conn = None
        self.config = None

    def connect(self):
        """Connect to PostgreSQL database."""
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            raise ValueError("DATABASE_URL not set")

        # Remove schema parameter if present (Prisma/Drizzle-specific)
        if "?schema=" in db_url:
            db_url = db_url.split("?schema=")[0]
        elif "&schema=" in db_url:
            db_url = db_url.replace("&schema=public", "").replace("&schema=", "")

        self.conn = psycopg2.connect(db_url)
        print(f"[ExperimentManager] Connected to database")

    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            self.conn = None

    def load_config(self) -> Dict[str, Any]:
        """Load experiment configuration from database."""
        if not self.conn:
            raise RuntimeError("Not connected to database. Call connect() first.")

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM experiments WHERE id = %s",
                (self.experiment_id,)
            )
            result = cur.fetchone()

        if not result:
            raise ValueError(f"Experiment {self.experiment_id} not found")

        self.config = dict(result)
        print(f"[ExperimentManager] Loaded config: {self.config['name']}")
        return self.config

    def update_status(self, status: str, error_message: Optional[str] = None):
        """Update experiment status in database."""
        if not self.conn:
            raise RuntimeError("Not connected to database")

        with self.conn.cursor() as cur:
            if status == "running":
                # Use PostgreSQL NOW() for consistent timezone handling
                cur.execute(
                    "UPDATE experiments SET status = %s, started_at = NOW() WHERE id = %s",
                    (status, self.experiment_id)
                )
            elif status == "completed":
                cur.execute(
                    "UPDATE experiments SET status = %s, completed_at = NOW() WHERE id = %s",
                    (status, self.experiment_id)
                )
            elif status == "failed":
                cur.execute(
                    "UPDATE experiments SET status = %s, error_message = %s, completed_at = NOW() WHERE id = %s",
                    (status, error_message, self.experiment_id)
                )
            else:
                cur.execute(
                    "UPDATE experiments SET status = %s WHERE id = %s",
                    (status, self.experiment_id)
                )
            self.conn.commit()
        print(f"[ExperimentManager] Status updated to: {status}")

    def save_round_metrics(self, round_num: int, metrics: Dict[str, Any]):
        """Save metrics for a specific round."""
        if not self.conn:
            raise RuntimeError("Not connected to database")

        with self.conn.cursor() as cur:
            # Use PostgreSQL NOW() for consistent timezone handling
            cur.execute(
                """
                INSERT INTO metrics (experiment_id, round, train_loss, train_accuracy,
                                     eval_loss, eval_accuracy, client_metrics, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    self.experiment_id,
                    round_num,
                    metrics.get("train_loss"),
                    metrics.get("train_accuracy"),
                    metrics.get("eval_loss"),
                    metrics.get("eval_accuracy"),
                    json.dumps(metrics.get("client_metrics", [])),
                )
            )
            self.conn.commit()
        print(f"[ExperimentManager] Saved metrics for round {round_num}")

    def save_final_results(self, accuracy: float, loss: float):
        """Save final experiment results."""
        if not self.conn:
            raise RuntimeError("Not connected to database")

        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE experiments SET final_accuracy = %s, final_loss = %s WHERE id = %s",
                (accuracy, loss, self.experiment_id)
            )
            self.conn.commit()
        print(f"[ExperimentManager] Saved final results - Accuracy: {accuracy:.4f}, Loss: {loss:.4f}")

    def record_checkpoint(self, round_num: int, file_path: str, accuracy: Optional[float], loss: Optional[float]):
        """Record a checkpoint in the database."""
        if not self.conn:
            raise RuntimeError("Not connected to database")

        with self.conn.cursor() as cur:
            # Use PostgreSQL NOW() for consistent timezone handling
            cur.execute(
                """
                INSERT INTO model_checkpoints (experiment_id, round, file_path, accuracy, loss, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                """,
                (
                    self.experiment_id,
                    round_num,
                    file_path,
                    accuracy,
                    loss,
                )
            )
            self.conn.commit()
        print(f"[ExperimentManager] Recorded checkpoint for round {round_num}")

    def save_logs(self, logs: str):
        """Save execution logs to the experiment."""
        if not self.conn:
            raise RuntimeError("Not connected to database")

        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE experiments SET logs = %s WHERE id = %s",
                (logs, self.experiment_id)
            )
            self.conn.commit()
        print(f"[ExperimentManager] Saved execution logs ({len(logs)} chars)")
