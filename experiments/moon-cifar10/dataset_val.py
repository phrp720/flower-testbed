"""
CIFAR-10 split the way the MOON paper splits it, with a held-out validation set
so hyperparameters are never chosen on the test set.

- 5,000 images (10%) of the CIFAR-10 training set are held out as a global
  validation set. The split is fixed: flwr-datasets shuffles with seed 42, then
  divides train 90/10.
- The remaining 45,000 training images are split across the clients with
  Dirichlet label skew, beta = 0.5 (10 clients in the paper), partition seed 0.
- Each client trains on all of its partition; there is no local 80/20 split.
- EVAL_SPLIT picks what every client evaluates on, and so what the platform's
  per-round eval_accuracy means:
    "valid" -> the 5,000-image validation set. Used for every tuning run.
    "test"  -> the 10,000-image CIFAR-10 test set. Used only to score the final
               checkpoints of the chosen runs (eval_runner.py --dataset).
  The two files dataset_val.py and dataset_test.py differ only in EVAL_SPLIT, so
  the training partitions are identical and a checkpoint trained with one can be
  scored with the other.
- Batch size 64.
- Training augmentation: reflect-pad 4, random crop 32, horizontal flip
  (the transforms in the MOON/NIID-Bench code).
"""
from typing import Tuple

import torch
from torch.utils.data import DataLoader
from torchvision import transforms
from flwr_datasets import FederatedDataset
from flwr_datasets.partitioner import DirichletPartitioner
from flwr_datasets.preprocessor import Divider

EVAL_SPLIT = "valid"

BETA = 0.5
PARTITION_SEED = 0
SHUFFLE_SEED = 42
VAL_FRACTION = 0.1
BATCH_SIZE = 64

_MEAN = (0.4914, 0.4822, 0.4465)
_STD = (0.2470, 0.2435, 0.2616)

_train_tf = transforms.Compose([
    transforms.RandomCrop(32, padding=4, padding_mode="reflect"),
    transforms.RandomHorizontalFlip(),
    transforms.ToTensor(),
    transforms.Normalize(_MEAN, _STD),
])
_eval_tf = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(_MEAN, _STD),
])

_fds = {}
_eval_loader = None


def _apply(tf):
    def fn(batch):
        batch["img"] = [tf(img) for img in batch["img"]]
        return batch
    return fn


def _collate(batch):
    images = torch.stack([b["img"] for b in batch])
    labels = torch.tensor([b["label"] for b in batch])
    return images, labels


def _federated_dataset(num_partitions: int) -> FederatedDataset:
    if num_partitions not in _fds:
        _fds[num_partitions] = FederatedDataset(
            dataset="uoft-cs/cifar10",
            shuffle=True,
            seed=SHUFFLE_SEED,
            preprocessor=Divider(
                divide_config={"train": 1.0 - VAL_FRACTION, "valid": VAL_FRACTION},
                divide_split="train",
            ),
            partitioners={"train": DirichletPartitioner(
                num_partitions=num_partitions,
                partition_by="label",
                alpha=BETA,
                min_partition_size=10,
                self_balancing=False,
                seed=PARTITION_SEED,
            )},
        )
    return _fds[num_partitions]


def load_data(partition_id: int, num_partitions: int) -> Tuple[DataLoader, DataLoader]:
    global _eval_loader
    fds = _federated_dataset(num_partitions)

    train = fds.load_partition(partition_id).with_transform(_apply(_train_tf))
    trainloader = DataLoader(train, batch_size=BATCH_SIZE, shuffle=True,
                             collate_fn=_collate)

    if _eval_loader is None:
        held_out = fds.load_split(EVAL_SPLIT).with_transform(_apply(_eval_tf))
        _eval_loader = DataLoader(held_out, batch_size=256, collate_fn=_collate)
    return trainloader, _eval_loader
