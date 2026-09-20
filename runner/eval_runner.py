"""
Evaluate a saved checkpoint, outside of any training run.

This is what makes it possible to ask "how does the round-3 global model do on
client 4's data?" -- a question the training loop never answers, because it only
ever evaluates each client on its own partition.

Usage:
    python runner/eval_runner.py <experiment_id> <round> [--client CID] [--partition N] [--dataset PATH]

Unlike flower_runner.py this is short-lived and foreground: it prints one JSON
line and exits, following runner/core/resources.py.
"""

import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("PYTHONWARNINGS", "ignore")

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

if (PROJECT_ROOT / ".env.local").exists():
    load_dotenv(PROJECT_ROOT / ".env.local")
else:
    load_dotenv(PROJECT_ROOT / ".env")


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate a saved model checkpoint")
    parser.add_argument("experiment_id", type=str)
    parser.add_argument("round", type=int)
    parser.add_argument("--client", type=str, default=None,
                        help="Evaluate this client's local model instead of the global one")
    parser.add_argument("--partition", type=int, default=None,
                        help="Evaluate on this client's data partition instead of partition 0")
    parser.add_argument("--dataset", type=str, default=None,
                        help="Dataset module to load data from; defaults to the experiment's own")
    args = parser.parse_args()

    import torch
    from runner.core.experiment import ExperimentManager
    from runner.core.checkpoint_manager import CheckpointManager
    from runner.core.module_loader import ModuleLoader
    from runner.pytorch.evaluate import evaluate_model
    from runner.pytorch.defaults.model import get_model as get_default_model
    from runner.pytorch.defaults.dataset import load_data as load_default_data

    manager = ExperimentManager(experiment_id=args.experiment_id, project_root=PROJECT_ROOT)
    manager.connect()

    try:
        config = manager.load_config()

        # Same partitioning as the training run, or the numbers are not comparable.
        custom_config = config.get("custom_config") or {}
        if custom_config.get("partitioner"):
            os.environ["FLOWER_PARTITIONER"] = json.dumps(custom_config["partitioner"])

        loader = ModuleLoader(PROJECT_ROOT, experiment_id=f"eval_{args.experiment_id}")

        model_fn = None
        model_path = config.get("model_path")
        if model_path and str(model_path).endswith(".py"):
            module = loader.load_module(model_path, "user_model")
            if module is not None:
                model_fn = loader.extract_model(module)
        if model_fn is None:
            model_fn = get_default_model

        load_data_fn = None
        dataset_path = args.dataset or config.get("dataset_path")
        if dataset_path and str(dataset_path).endswith(".py"):
            module = loader.load_module(dataset_path, "user_dataset")
            if module is not None:
                load_data_fn = loader.extract_dataset_loader(module)
        if load_data_fn is None:
            load_data_fn = load_default_data

        checkpoints = CheckpointManager(experiment_id=args.experiment_id, project_root=PROJECT_ROOT)

        if args.client is None:
            checkpoint_path = checkpoints.checkpoint_dir / f"round_{args.round}.pt"
        else:
            safe_cid = str(args.client).replace("/", "_")[:64]
            checkpoint_path = checkpoints.checkpoint_dir / f"round_{args.round}" / f"client_{safe_cid}.pt"

        if not checkpoint_path.exists():
            print(json.dumps({
                "ok": False,
                "error": f"No checkpoint at {checkpoint_path.name}. "
                         "Per-client checkpoints require customConfig.save_client_checkpoints "
                         "to have been set when the experiment ran.",
            }))
            return 0

        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)

        model = model_fn()
        model.load_state_dict(checkpoint["model_state_dict"])

        device = torch.device("cpu")
        if torch.cuda.is_available():
            device = torch.device("cuda")
        elif torch.backends.mps.is_available():
            device = torch.device("mps")

        partition_id = args.partition if args.partition is not None else 0
        num_partitions = config.get("num_clients", 10)
        _, testloader = load_data_fn(int(partition_id), int(num_partitions))

        loss, accuracy, extra = evaluate_model(model, testloader, device)

        manager.record_evaluation(
            round_num=args.round,
            client_id=args.client,
            accuracy=accuracy,
            loss=loss,
            extra_metrics=extra,
            dataset_path=str(dataset_path) if dataset_path else None,
            split=f"partition_{partition_id}",
        )

        print(json.dumps({
            "ok": True,
            "experimentId": args.experiment_id,
            "round": args.round,
            "clientId": args.client,
            "evaluatedOnPartition": partition_id,
            "device": str(device),
            "loss": loss,
            "accuracy": accuracy,
            "samples": int(extra.get("samples", 0)),
            "storedMetrics": checkpoint.get("metrics"),
        }))
        return 0

    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        return 0
    finally:
        manager.close()


if __name__ == "__main__":
    sys.exit(main())
