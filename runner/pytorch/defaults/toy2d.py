"""
Two-dimensional toy datasets, and a small network to go with them.

These exist for one reason: with a 2D input you can draw what the model has
learned. Sweep a grid of (x, y) points through the network, colour each cell by
the output, and the decision boundary is visible directly -- along with what each
individual neuron responds to.

That is impossible for CIFAR-10. A 32x32x3 image is 3072 numbers; there is no
plane to sweep. The federated learning is identical either way -- the same
strategies, the same partitioning, the same Flower simulation -- but only here
can it be drawn.

Configure through an experiment's customConfig:

    {"dataset": {"kind": "circle", "samples": 500, "noise": 0.1}}

Kinds: circle, spiral, xor, gauss.
"""

import json
import math
import os
from typing import Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

# The coordinate range the playground-style plots are drawn over. Keeping the
# data and the drawing on the same scale is what makes the picture meaningful.
DOMAIN = 6.0

_cache: Dict[str, Tuple[np.ndarray, np.ndarray]] = {}


def _dataset_config() -> Dict:
    """Read the dataset config the orchestrator passes down through the environment."""
    raw = os.environ.get("FLOWER_TOY2D")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def generate(kind: str = "circle", samples: int = 500, noise: float = 0.1,
             seed: int = 42) -> Tuple[np.ndarray, np.ndarray]:
    """Generate a labelled 2D dataset. Returns (points, labels) with labels in {0, 1}."""
    rng = np.random.default_rng(seed)
    kind = (kind or "circle").lower()

    if kind == "circle":
        # Two concentric rings.
        radii = np.concatenate([
            rng.uniform(0, DOMAIN * 0.5, samples // 2),
            rng.uniform(DOMAIN * 0.7, DOMAIN, samples - samples // 2),
        ])
        angles = rng.uniform(0, 2 * math.pi, samples)
        labels = np.concatenate([np.zeros(samples // 2), np.ones(samples - samples // 2)])

    elif kind == "spiral":
        n = samples // 2
        t = np.linspace(0, 3.5 * math.pi, n)
        r = np.linspace(0.4, DOMAIN, n)
        points = np.concatenate([
            np.stack([r * np.cos(t), r * np.sin(t)], axis=1),
            np.stack([r * np.cos(t + math.pi), r * np.sin(t + math.pi)], axis=1),
        ])
        labels = np.concatenate([np.zeros(n), np.ones(len(points) - n)])
        points += rng.normal(0, noise * DOMAIN * 0.3, points.shape)
        return points.astype(np.float32), labels.astype(np.int64)

    elif kind == "xor":
        points = rng.uniform(-DOMAIN, DOMAIN, (samples, 2))
        # Nudge points off the axes so the classes are separable.
        points += np.sign(points) * 0.4
        labels = ((points[:, 0] > 0) == (points[:, 1] > 0)).astype(np.int64)
        points += rng.normal(0, noise * DOMAIN * 0.2, points.shape)
        return points.astype(np.float32), labels.astype(np.int64)

    elif kind == "gauss":
        half = samples // 2
        points = np.concatenate([
            rng.normal([DOMAIN * 0.45, DOMAIN * 0.45], DOMAIN * 0.18, (half, 2)),
            rng.normal([-DOMAIN * 0.45, -DOMAIN * 0.45], DOMAIN * 0.18, (samples - half, 2)),
        ])
        labels = np.concatenate([np.zeros(half), np.ones(samples - half)])
        points += rng.normal(0, noise * DOMAIN * 0.2, points.shape)
        return points.astype(np.float32), labels.astype(np.int64)

    else:
        raise ValueError(f"Unknown dataset kind '{kind}'. Use circle, spiral, xor or gauss.")

    points = np.stack([radii * np.cos(angles), radii * np.sin(angles)], axis=1)
    points += rng.normal(0, noise * DOMAIN * 0.2, points.shape)
    return points.astype(np.float32), labels.astype(np.int64)


def _full_dataset() -> Tuple[np.ndarray, np.ndarray]:
    config = _dataset_config()
    kind = config.get("kind", "circle")
    samples = int(config.get("samples", 500))
    noise = float(config.get("noise", 0.1))
    seed = int(config.get("seed", 42))

    cache_key = f"{kind}_{samples}_{noise}_{seed}"
    if cache_key not in _cache:
        _cache[cache_key] = generate(kind, samples, noise, seed)
    return _cache[cache_key]


def _partition_indices(labels: np.ndarray, partition_id: int, num_partitions: int) -> np.ndarray:
    """
    Split the dataset across clients, honouring the same partitioner config the
    image datasets use so a 2D run is non-IID in the same way.
    """
    raw = os.environ.get("FLOWER_PARTITIONER")
    config = {}
    if raw:
        try:
            config = json.loads(raw) or {}
        except (ValueError, TypeError):
            config = {}

    kind = str(config.get("kind", "iid")).lower()
    rng = np.random.default_rng(int(config.get("seed", 42)))
    n = len(labels)

    if kind == "dirichlet":
        alpha = float(config.get("alpha", 0.5))
        # Draw each class's split across clients from Dir(alpha); a low alpha
        # concentrates each class on a few clients.
        assignment = np.full(n, -1, dtype=np.int64)
        for label in np.unique(labels):
            idx = np.where(labels == label)[0]
            rng.shuffle(idx)
            proportions = rng.dirichlet([alpha] * num_partitions)
            cuts = (np.cumsum(proportions) * len(idx)).astype(int)[:-1]
            for client, chunk in enumerate(np.split(idx, cuts)):
                assignment[chunk] = client
        # Anything unassigned by rounding goes round-robin.
        leftover = np.where(assignment < 0)[0]
        assignment[leftover] = leftover % num_partitions
        return np.where(assignment == partition_id)[0]

    indices = np.arange(n)
    rng.shuffle(indices)
    return np.array_split(indices, num_partitions)[partition_id]


def load_data(
    partition_id: int,
    num_partitions: int,
    batch_size: int = 32,
) -> Tuple[DataLoader, DataLoader]:
    """Load this client's slice of the 2D dataset. Matches the standard contract."""
    points, labels = _full_dataset()
    indices = _partition_indices(labels, int(partition_id), int(num_partitions))

    x = torch.from_numpy(points[indices])
    y = torch.from_numpy(labels[indices])

    # 80/20 split, deterministic so rounds are comparable.
    split = max(1, int(len(x) * 0.8))
    train = TensorDataset(x[:split], y[:split])
    test = TensorDataset(x[split:], y[split:]) if len(x) > split else TensorDataset(x, y)

    return (
        DataLoader(train, batch_size=batch_size, shuffle=True),
        DataLoader(test, batch_size=batch_size),
    )


class Toy2DNet(nn.Module):
    """
    A small fully-connected network over two inputs.

    Deliberately tiny: the point is that every neuron can be drawn, which stops
    being legible past a handful per layer.
    """

    def __init__(self, hidden=(4, 2)):
        super().__init__()
        self.hidden_sizes = list(hidden)

        layers = []
        previous = 2
        for size in self.hidden_sizes:
            layers.append(nn.Linear(previous, size))
            previous = size
        self.hidden = nn.ModuleList(layers)
        self.out = nn.Linear(previous, 2)
        self.activation = nn.Tanh()

    def forward(self, x):
        for layer in self.hidden:
            x = self.activation(layer(x))
        return self.out(x)

    def activations(self, x):
        """Every hidden layer's output, for drawing what each neuron responds to."""
        result = []
        for layer in self.hidden:
            x = self.activation(layer(x))
            result.append(x)
        return result


def get_model() -> nn.Module:
    config = _dataset_config()
    hidden = config.get("hidden", [4, 2])
    return Toy2DNet(hidden=tuple(int(h) for h in hidden))


def get_domain() -> float:
    return DOMAIN
