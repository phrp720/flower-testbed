#!/usr/bin/env python3
"""
Flower Experiment Runner - Entry Point

This is the main entry point for running Flower federated learning experiments.
It delegates to the modular PyTorch simulation orchestrator.

Usage:
    python runner/flower_runner.py <experiment_id>
"""

import os
import sys
import warnings
import logging
import argparse
from pathlib import Path

# ============================================================================
# Warning and logging suppression (must be done before importing other modules)
# ============================================================================

# Suppress Ray FutureWarning about accelerator env var override
os.environ["RAY_ACCEL_ENV_VAR_OVERRIDE_ON_ZERO"] = "0"

# Suppress Ray metrics exporter connection errors (non-critical for local runs)
os.environ["RAY_IGNORE_UNHANDLED_ERRORS"] = "1"

# Suppress Python warnings globally (affects Ray worker processes too)
os.environ["PYTHONWARNINGS"] = "ignore"

# Suppress HuggingFace Hub warnings in worker processes
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Suppress deprecation warnings from datasets/dill (co_lnotab deprecation)
warnings.filterwarnings("ignore", message="co_lnotab is deprecated", category=DeprecationWarning)

# Suppress HuggingFace Hub unauthenticated request warnings
warnings.filterwarnings("ignore", message=".*unauthenticated requests.*", category=UserWarning)

# Suppress Ray internal warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="ray")

# Reduce verbosity of Ray's internal logging
logging.getLogger("ray").setLevel(logging.ERROR)
logging.getLogger("ray.data").setLevel(logging.ERROR)
logging.getLogger("ray.tune").setLevel(logging.ERROR)
logging.getLogger("ray.rllib").setLevel(logging.ERROR)

# Suppress Flower's verbose INFO logging (we capture it in logs anyway)
logging.getLogger("flwr").setLevel(logging.WARNING)

# Suppress Ray actor stdout/stderr from appearing in terminal
# (these are the "(ClientAppActor pid=XXXX)" messages)
os.environ["RAY_DEDUP_LOGS"] = "1"  # Deduplicate repeated logs
os.environ["RAY_COLOR_PREFIX"] = "0"  # Disable colored prefixes
os.environ["RAY_LOG_TO_STDERR"] = "0"  # Don't log to stderr

# ============================================================================

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Run a Flower federated learning experiment"
    )
    parser.add_argument(
        "experiment_id",
        type=int,
        help="Experiment ID from database"
    )
    args = parser.parse_args()

    # Load environment variables
    from dotenv import load_dotenv
    env_path = PROJECT_ROOT / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # Try .env as fallback
        load_dotenv(PROJECT_ROOT / ".env")

    # Get the framework from the database to select the right orchestrator
    from runner.core.experiment import ExperimentManager
    exp_manager = ExperimentManager(args.experiment_id, PROJECT_ROOT)
    exp_manager.connect()
    config = exp_manager.load_config()
    framework = config.get('framework', 'pytorch')
    exp_manager.close()

    # Select the appropriate orchestrator based on framework
    # (all output is captured to logs, not printed to terminal)
    if framework == 'pytorch':
        from runner.pytorch.simulation import SimulationOrchestrator
    # Future: add more frameworks here
    # elif framework == 'tensorflow':
    #     from runner.tensorflow.simulation import SimulationOrchestrator
    # elif framework == 'jax':
    #     from runner.jax.simulation import SimulationOrchestrator
    else:
        # Default to PyTorch for now (other frameworks not yet implemented)
        from runner.pytorch.simulation import SimulationOrchestrator

    # Create and run orchestrator
    orchestrator = SimulationOrchestrator(
        experiment_id=args.experiment_id,
        project_root=PROJECT_ROOT,
    )
    orchestrator.run()


if __name__ == "__main__":
    main()
