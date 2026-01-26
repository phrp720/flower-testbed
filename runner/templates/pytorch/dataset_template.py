"""
Custom Dataset Template for Flower Federated Learning

Instructions:
1. Implement the load_data() function
2. Return (train_loader, test_loader) for the given partition
3. Each client gets a different partition of the data

The framework will call load_data(partition_id, num_partitions) where:
- partition_id: Client ID (0 to num_partitions-1)
- num_partitions: Total number of clients

You can use any data source:
- Local files (CSV, images, etc.)
- flwr-datasets for standard datasets
- Custom data generation
"""

from typing import Tuple

import torch
from torch.utils.data import DataLoader, Dataset, Subset
from torchvision import transforms, datasets


# Example 1: Using a local dataset
class CustomDataset(Dataset):
    """
    Example custom dataset.

    Replace this with your own dataset implementation.
    """

    def __init__(self, data, labels, transform=None):
        self.data = data
        self.labels = labels
        self.transform = transform

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        sample = self.data[idx]
        label = self.labels[idx]

        if self.transform:
            sample = self.transform(sample)

        return sample, label


def load_data(
    partition_id: int,
    num_partitions: int,
    batch_size: int = 32,
) -> Tuple[DataLoader, DataLoader]:
    """
    Load data partition for a specific client.

    Args:
        partition_id: The partition/client ID (0 to num_partitions-1)
        num_partitions: Total number of partitions/clients
        batch_size: Batch size for DataLoaders

    Returns:
        Tuple of (train_loader, test_loader)
    """
    # Example: Using CIFAR-10 with manual partitioning
    # Replace this with your own data loading logic

    transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
    ])

    # Load full dataset
    trainset = datasets.CIFAR10(
        root="./data",
        train=True,
        download=True,
        transform=transform,
    )

    testset = datasets.CIFAR10(
        root="./data",
        train=False,
        download=True,
        transform=transform,
    )

    # Partition the data (IID partitioning)
    train_indices = partition_indices(len(trainset), num_partitions, partition_id)
    test_indices = partition_indices(len(testset), num_partitions, partition_id)

    train_subset = Subset(trainset, train_indices)
    test_subset = Subset(testset, test_indices)

    # Create DataLoaders
    trainloader = DataLoader(
        train_subset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=0,
    )

    testloader = DataLoader(
        test_subset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
    )

    return trainloader, testloader


def partition_indices(total_size: int, num_partitions: int, partition_id: int) -> list:
    """
    Get indices for a specific partition (IID partitioning).

    Args:
        total_size: Total number of samples
        num_partitions: Number of partitions
        partition_id: Which partition to return

    Returns:
        List of indices for this partition
    """
    # Calculate partition size
    partition_size = total_size // num_partitions
    start_idx = partition_id * partition_size

    # Last partition gets remaining samples
    if partition_id == num_partitions - 1:
        end_idx = total_size
    else:
        end_idx = start_idx + partition_size

    return list(range(start_idx, end_idx))


# Example 2: Using flwr-datasets (recommended for standard datasets)
def load_data_with_flwr_datasets(
    partition_id: int,
    num_partitions: int,
    batch_size: int = 32,
) -> Tuple[DataLoader, DataLoader]:
    """
    Alternative implementation using flwr-datasets.

    This is the recommended approach for standard datasets.
    """
    from flwr_datasets import FederatedDataset
    from flwr_datasets.partitioner import IidPartitioner

    # Create federated dataset
    partitioner = IidPartitioner(num_partitions=num_partitions)
    fds = FederatedDataset(
        dataset="uoft-cs/cifar10",
        partitioners={"train": partitioner},
    )

    # Load partition
    partition = fds.load_partition(partition_id)
    partition_train_test = partition.train_test_split(test_size=0.2, seed=42)

    # Transforms
    pytorch_transforms = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616)),
    ])

    def apply_transforms(batch):
        batch["img"] = [pytorch_transforms(img) for img in batch["img"]]
        return batch

    partition_train = partition_train_test["train"].with_transform(apply_transforms)
    partition_test = partition_train_test["test"].with_transform(apply_transforms)

    def collate_fn(batch):
        images = torch.stack([item["img"] for item in batch])
        labels = torch.tensor([item["label"] for item in batch])
        return images, labels

    trainloader = DataLoader(
        partition_train,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_fn,
        num_workers=0,
    )

    testloader = DataLoader(
        partition_test,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=0,
    )

    return trainloader, testloader
