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

    def __init__(self, experiment_id: str, project_root: Path):
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
                    json.dumps(metrics.get("client_metrics") or []),
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

    def save_resolved_setup(self, setup: dict):
        """
        Record what the run is actually made of, under custom_config.resolved.

        Merged into the existing blob rather than replacing it, because the
        configured values sitting beside it are what the user asked for and are
        still worth keeping -- the pair is only interesting when they disagree.

        jsonb concatenation does the merge in Postgres, so a run that is
        restarted overwrites its own resolved block without disturbing the
        partitioner or strategy config next to it. Never fatal: failing to
        describe a run is not a reason to stop it.
        """
        if not self.conn:
            raise RuntimeError("Not connected to database")

        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE experiments
                       SET custom_config = COALESCE(custom_config, '{}'::jsonb)
                                           || jsonb_build_object('resolved', %s::jsonb)
                     WHERE id = %s
                    """,
                    (json.dumps(setup), self.experiment_id),
                )
                self.conn.commit()
            print(f"[ExperimentManager] Resolved setup: {setup}")
        except Exception as error:
            self.conn.rollback()
            print(f"[ExperimentManager] Could not save resolved setup: {error}")

    def record_checkpoint(
        self,
        round_num: int,
        file_path: str,
        accuracy: Optional[float],
        loss: Optional[float],
        client_id: Optional[str] = None,
    ):
        """
        Record a checkpoint in the database.

        client_id is NULL for the aggregated global model and set for a client's
        local model, so existing queries that want the global chain filter on
        `client_id IS NULL`.
        """
        if not self.conn:
            raise RuntimeError("Not connected to database")

        with self.conn.cursor() as cur:
            # Use PostgreSQL NOW() for consistent timezone handling
            cur.execute(
                """
                INSERT INTO model_checkpoints (experiment_id, round, file_path, accuracy, loss, client_id, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    self.experiment_id,
                    round_num,
                    file_path,
                    accuracy,
                    loss,
                    str(client_id) if client_id is not None else None,
                )
            )
            self.conn.commit()
        if client_id is None:
            print(f"[ExperimentManager] Recorded checkpoint for round {round_num}")

    def record_evaluation(
        self,
        round_num: int,
        client_id: Optional[str],
        accuracy: Optional[float],
        loss: Optional[float],
        extra_metrics: Optional[Dict[str, Any]] = None,
        dataset_path: Optional[str] = None,
        split: Optional[str] = None,
    ):
        """
        Record a standalone evaluation.

        Kept out of the `metrics` table on purpose: that one is the per-round
        training series, and mixing ad-hoc evaluations into it would make the
        training charts wrong.
        """
        if not self.conn:
            raise RuntimeError("Not connected to database")

        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO evaluation_runs
                    (experiment_id, round, client_id, dataset_path, split,
                     loss, accuracy, extra_metrics, status, created_at, completed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'completed', NOW(), NOW())
                """,
                (
                    self.experiment_id,
                    round_num,
                    str(client_id) if client_id is not None else None,
                    dataset_path,
                    split,
                    loss,
                    accuracy,
                    json.dumps(extra_metrics or {}),
                )
            )
            self.conn.commit()
        print(f"[ExperimentManager] Recorded evaluation for round {round_num}")

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
