"""
Default CIFAR-10 dataset loading using flwr-datasets.

This dataset loader is used when no custom dataset is provided.
"""

from typing import Tuple

import torch
from torch.utils.data import DataLoader
from torchvision import transforms

from flwr_datasets import FederatedDataset
from flwr_datasets.partitioner import IidPartitioner


# Global cache for the federated dataset
_fds_cache = {}


def load_data(
    partition_id: int,
    num_partitions: int,
    batch_size: int = 32,
) -> Tuple[DataLoader, DataLoader]:
    """
    Load CIFAR-10 data partition for a specific client.

    Uses flwr-datasets for efficient IID partitioning.

    Args:
        partition_id: The partition/client ID (0 to num_partitions-1)
        num_partitions: Total number of partitions/clients
        batch_size: Batch size for DataLoaders

    Returns:
        Tuple of (train_loader, test_loader)
    """
    # Create or reuse federated dataset
    cache_key = f"cifar10_{num_partitions}"

    if cache_key not in _fds_cache:
        partitioner = IidPartitioner(num_partitions=num_partitions)
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
