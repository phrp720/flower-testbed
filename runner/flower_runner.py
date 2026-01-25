#!/usr/bin/env python3
"""
Flower Experiment Runner - Entry Point

This is the main entry point for running Flower federated learning experiments.
It delegates to the modular PyTorch simulation orchestrator.

Usage:
    python runner/flower_runner.py <experiment_id>
"""

import sys
import argparse
from pathlib import Path

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

    # Import and run the simulation orchestrator
    from runner.pytorch.simulation import SimulationOrchestrator

    print(f"\n{'='*60}")
    print(f"Flower Federated Learning Runner")
    print(f"{'='*60}")
    print(f"Experiment ID: {args.experiment_id}")
    print(f"Project Root: {PROJECT_ROOT}")
    print(f"{'='*60}\n")

    # Create and run orchestrator
    orchestrator = SimulationOrchestrator(
        experiment_id=args.experiment_id,
        project_root=PROJECT_ROOT,
    )
    orchestrator.run()


if __name__ == "__main__":
    main()
