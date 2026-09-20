"""
Default CIFAR-10 dataset loading using flwr-datasets.

This dataset loader is used when no custom dataset is provided.
"""

import json
import os
from typing import Any, Dict, Optional, Tuple

import torch
from torch.utils.data import DataLoader
from torchvision import transforms

from flwr_datasets import FederatedDataset
from flwr_datasets.partitioner import (
    DirichletPartitioner,
    IidPartitioner,
    PathologicalPartitioner,
    ShardPartitioner,
)


# Global cache for the federated dataset
_fds_cache = {}

# The label column CIFAR-10 partitions by.
_LABEL_COLUMN = "label"


def _partitioner_config() -> Dict[str, Any]:
    """
    Read the partitioning config the orchestrator passes down.

    It arrives as an environment variable rather than a function argument because
    load_data is called positionally with exactly two arguments -- that signature
    is the contract every uploaded dataset module implements, so it cannot grow.
    """
    raw = os.environ.get("FLOWER_PARTITIONER")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        print(f"[Dataset] Ignoring malformed FLOWER_PARTITIONER: {raw[:120]}")
        return {}


def build_partitioner(num_partitions: int, config: Optional[Dict[str, Any]] = None):
    """
    Build a partitioner from a config dict.

    Supported kinds:
      iid           -- equal random split (the default)
      dirichlet     -- label distribution drawn from Dir(alpha); lower alpha is
                       more skewed. alpha=0.5 is a common non-IID benchmark,
                       alpha=0.1 is severe.
      shard         -- each client gets a fixed number of label shards, so most
                       clients see only a few classes
      pathological  -- each client sees exactly num_classes_per_partition classes

    Non-IID partitioning is the point of most federated learning research: with an
    IID split, FedAvg is hard to beat and strategy differences barely show.
    """
    config = config or {}
    kind = str(config.get("kind", "iid")).lower()

    try:
        if kind == "dirichlet":
            return DirichletPartitioner(
                num_partitions=num_partitions,
                partition_by=config.get("partition_by", _LABEL_COLUMN),
                alpha=float(config.get("alpha", 0.5)),
                min_partition_size=int(config.get("min_partition_size", 10)),
                self_balancing=bool(config.get("self_balancing", True)),
                seed=int(config.get("seed", 42)),
            )

        if kind == "shard":
            return ShardPartitioner(
                num_partitions=num_partitions,
                partition_by=config.get("partition_by", _LABEL_COLUMN),
                num_shards_per_partition=int(config.get("num_shards_per_partition", 2)),
                seed=int(config.get("seed", 42)),
            )

        if kind == "pathological":
            return PathologicalPartitioner(
                num_partitions=num_partitions,
                partition_by=config.get("partition_by", _LABEL_COLUMN),
                num_classes_per_partition=int(config.get("num_classes_per_partition", 2)),
                seed=int(config.get("seed", 42)),
            )
    except Exception as e:
        # A bad partitioner config should degrade to IID, not lose the run.
        print(f"[Dataset] Failed to build '{kind}' partitioner ({e}); using IID.")
        return IidPartitioner(num_partitions=num_partitions)

    if kind != "iid":
        print(f"[Dataset] Unknown partitioner '{kind}'; using IID.")

    return IidPartitioner(num_partitions=num_partitions)


def load_data(
    partition_id: int,
    num_partitions: int,
    batch_size: int = 32,
) -> Tuple[DataLoader, DataLoader]:
    """
    Load CIFAR-10 data partition for a specific client.

    Partitioning defaults to IID and is configurable through the experiment's
    customConfig.partitioner (Dirichlet, shard or pathological) for non-IID setups.

    Args:
        partition_id: The partition/client ID (0 to num_partitions-1)
        num_partitions: Total number of partitions/clients
        batch_size: Batch size for DataLoaders

    Returns:
        Tuple of (train_loader, test_loader)
    """
    # Create or reuse federated dataset. The partitioner config is part of the
    # cache key, or a second experiment would silently reuse the first split.
    config = _partitioner_config()
    cache_key = f"cifar10_{num_partitions}_{json.dumps(config, sort_keys=True)}"

    if cache_key not in _fds_cache:
        partitioner = build_partitioner(num_partitions, config)
        print(f"[Dataset] Partitioning with {type(partitioner).__name__} "
              f"across {num_partitions} clients")
        _fds_cache[cache_key] = FederatedDataset(
            dataset="uoft-cs/cifar10",
            partitioners={"train": partitioner},
        )

    fds = _fds_cache[cache_key]

    # Load this client's partition
    partition = fds.load_partition(partition_id)

    # Split into train and test (80/20 split)
    partition_train_test = partition.train_test_split(test_size=0.2, seed=42)

    # Define transforms
    pytorch_transforms = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
    ])

    def apply_transforms(batch):
        """Apply transforms to a batch of images."""
        batch["img"] = [pytorch_transforms(img) for img in batch["img"]]
        return batch

    # Apply transforms
    partition_train = partition_train_test["train"].with_transform(apply_transforms)
    partition_test = partition_train_test["test"].with_transform(apply_transforms)

    # Create DataLoaders
    def collate_fn(batch):
        """Custom collate function for CIFAR-10."""
        images = torch.stack([item["img"] for item in batch])
        labels = torch.tensor([item["label"] for item in batch])
        return images, labels

    trainloader = DataLoader(
        partition_train,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_fn,
        num_workers=0,  # Use 0 for simulation compatibility
    )

    testloader = DataLoader(
        partition_test,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=0,
    )

    return trainloader, testloader


def get_centralized_testset(batch_size: int = 32) -> DataLoader:
    """
    Get the full centralized test set for evaluation.

    Args:
        batch_size: Batch size for DataLoader

    Returns:
        DataLoader for the full test set
    """
    from flwr_datasets import FederatedDataset

    fds = FederatedDataset(dataset="uoft-cs/cifar10", partitioners={})
    testset = fds.load_split("test")

    pytorch_transforms = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
    ])

    def apply_transforms(batch):
        batch["img"] = [pytorch_transforms(img) for img in batch["img"]]
        return batch

    testset = testset.with_transform(apply_transforms)

    def collate_fn(batch):
        images = torch.stack([item["img"] for item in batch])
        labels = torch.tensor([item["label"] for item in batch])
        return images, labels

    return DataLoader(
        testset,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=0,
    )
