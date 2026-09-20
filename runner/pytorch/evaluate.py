"""
Model evaluation, factored out so there is exactly one implementation.

FlowerClient._evaluate used to hold the only copy. Standalone evaluation of a
saved checkpoint has to produce numbers comparable with the ones recorded during
training, which it cannot do with a second implementation that might drift.
"""

from typing import Dict, Tuple

import torch
import torch.nn as nn
from torch.utils.data import DataLoader


def evaluate_model(
    model: nn.Module,
    dataloader: DataLoader,
    device: torch.device,
) -> Tuple[float, float, Dict[str, float]]:
    """
    Evaluate a model over a dataloader.

    Args:
        model: Model to evaluate
        dataloader: Data to evaluate on
        device: Device to run on

    Returns:
        (average_loss, accuracy, extra_metrics)
    """
    model.to(device)
    model.eval()

    criterion = nn.CrossEntropyLoss()
    total_loss = 0.0
    correct = 0
    total = 0
    batches = 0

    with torch.no_grad():
        for batch in dataloader:
            images, labels = batch
            images, labels = images.to(device), labels.to(device)

            outputs = model(images)
            total_loss += criterion(outputs, labels).item()
            batches += 1

            _, predicted = torch.max(outputs.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()

    average_loss = total_loss / batches if batches else 0.0
    accuracy = correct / total if total else 0.0

    return average_loss, accuracy, {"samples": float(total), "batches": float(batches)}
