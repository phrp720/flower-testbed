"""
CIFAR-10 split the way the MOON paper splits it.

- Dirichlet label skew, beta = 0.5, across the experiment's clients (10 in the paper).
- Each client trains on all of its partition; there is no 80/20 local split.
- Evaluation uses the global CIFAR-10 test set (10,000 images), because that is
  what the paper reports. Every client returns the same test set, so the
  platform's weighted eval_accuracy equals the global model's test accuracy.
- Batch size 64.
- Training augmentation: reflect-pad 4, random crop 32, horizontal flip
  (the transforms in the MOON/NIID-Bench code).
"""
import os
from typing import Tuple

import torch
from torch.utils.data import DataLoader
from torchvision import transforms
from flwr_datasets import FederatedDataset
from flwr_datasets.partitioner import DirichletPartitioner

BETA = float(os.environ.get("MOON_BETA", "0.5"))
SEED = int(os.environ.get("MOON_SEED", "0"))
BATCH_SIZE = 64

_MEAN = (0.4914, 0.4822, 0.4465)
_STD = (0.2470, 0.2435, 0.2616)

_train_tf = transforms.Compose([
    transforms.RandomCrop(32, padding=4, padding_mode="reflect"),
    transforms.RandomHorizontalFlip(),
    transforms.ToTensor(),
    transforms.Normalize(_MEAN, _STD),
])
_test_tf = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(_MEAN, _STD),
])

_fds = {}
_test_loader = None


def _apply(tf):
    def fn(batch):
        batch["img"] = [tf(img) for img in batch["img"]]
        return batch
    return fn


def _collate(batch):
    images = torch.stack([b["img"] for b in batch])
    labels = torch.tensor([b["label"] for b in batch])
    return images, labels


def load_data(partition_id: int, num_partitions: int) -> Tuple[DataLoader, DataLoader]:
    global _test_loader
    if num_partitions not in _fds:
        _fds[num_partitions] = FederatedDataset(
            dataset="uoft-cs/cifar10",
            partitioners={"train": DirichletPartitioner(
                num_partitions=num_partitions,
                partition_by="label",
                alpha=BETA,
                min_partition_size=10,
                self_balancing=False,
                seed=SEED,
            )},
        )
    fds = _fds[num_partitions]

    train = fds.load_partition(partition_id).with_transform(_apply(_train_tf))
    trainloader = DataLoader(train, batch_size=BATCH_SIZE, shuffle=True,
                             collate_fn=_collate)

    if _test_loader is None:
        test = fds.load_split("test").with_transform(_apply(_test_tf))
        _test_loader = DataLoader(test, batch_size=256, collate_fn=_collate)
    return trainloader, _test_loader
