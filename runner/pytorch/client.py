"""
FlowerClient - PyTorch client implementation for Flower federated learning.
"""

from collections import OrderedDict
from typing import List, Tuple, Dict, Any, Callable

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

import flwr as fl
from flwr.client import Client
from flwr.common import NDArrays, Scalar, Context


class FlowerClient(fl.client.NumPyClient):
    """
    Flower client for PyTorch models.

    Implements the NumPyClient interface for federated learning
    with PyTorch models.
    """

    def __init__(
        self,
        model: nn.Module,
        trainloader: DataLoader,
        testloader: DataLoader,
        device: torch.device,
        local_epochs: int = 1,
        learning_rate: float = 0.01,
    ):
        """
        Initialize the Flower client.

        Args:
            model: PyTorch model to train
            trainloader: DataLoader for training data
            testloader: DataLoader for test/validation data
            device: Device to run computations on (cpu/cuda)
            local_epochs: Number of local training epochs per round
            learning_rate: Learning rate for optimizer
        """
        self.model = model.to(device)
        self.trainloader = trainloader
        self.testloader = testloader
        self.device = device
        self.local_epochs = local_epochs
        self.learning_rate = learning_rate

    def get_parameters(self, config: Dict[str, Scalar]) -> NDArrays:
        """Return model parameters as a list of NumPy arrays."""
        return [val.cpu().numpy() for _, val in self.model.state_dict().items()]

    def set_parameters(self, parameters: NDArrays) -> None:
        """Set model parameters from a list of NumPy arrays."""
        params_dict = zip(self.model.state_dict().keys(), parameters)
        state_dict = OrderedDict({k: torch.tensor(v) for k, v in params_dict})
        self.model.load_state_dict(state_dict, strict=True)

    def fit(
        self, parameters: NDArrays, config: Dict[str, Scalar]
    ) -> Tuple[NDArrays, int, Dict[str, Scalar]]:
        """
        Train the model on local data.

        Args:
            parameters: Current global model parameters
            config: Configuration from server

        Returns:
            Updated parameters, number of samples, and training metrics
        """
        # Set global model parameters
        self.set_parameters(parameters)

        # Get local epochs from config if provided
        local_epochs = int(config.get("local_epochs", self.local_epochs))
        learning_rate = float(config.get("learning_rate", self.learning_rate))

        # Train the model
        train_loss, train_acc = self._train(local_epochs, learning_rate)

        # Return updated parameters, number of samples, and metrics
        return (
            self.get_parameters(config={}),
            len(self.trainloader.dataset),
            {
                "train_loss": float(train_loss),
                "train_accuracy": float(train_acc),
            },
        )

    def evaluate(
        self, parameters: NDArrays, config: Dict[str, Scalar]
    ) -> Tuple[float, int, Dict[str, Scalar]]:
        """
        Evaluate the model on local test data.

        Args:
            parameters: Current global model parameters
            config: Configuration from server

        Returns:
            Loss, number of samples, and evaluation metrics
        """
        self.set_parameters(parameters)

        loss, accuracy = self._evaluate()

        return (
            float(loss),
            len(self.testloader.dataset),
            {"eval_accuracy": float(accuracy)},
        )

    def _train(self, epochs: int, learning_rate: float) -> Tuple[float, float]:
        """
        Train the model for specified epochs.

        Args:
            epochs: Number of epochs to train
            learning_rate: Learning rate

        Returns:
            Average loss and accuracy
        """
        self.model.train()
        criterion = nn.CrossEntropyLoss()
        optimizer = torch.optim.SGD(
            self.model.parameters(),
            lr=learning_rate,
            momentum=0.9,
        )

        total_loss = 0.0
        correct = 0
        total = 0

        for _ in range(epochs):
            for batch in self.trainloader:
                images, labels = batch
                images, labels = images.to(self.device), labels.to(self.device)

                optimizer.zero_grad()
                outputs = self.model(images)
                loss = criterion(outputs, labels)
                loss.backward()
                optimizer.step()

                total_loss += loss.item()
                _, predicted = outputs.max(1)
                total += labels.size(0)
                correct += predicted.eq(labels).sum().item()

        avg_loss = total_loss / len(self.trainloader) / epochs
        accuracy = correct / total

        return avg_loss, accuracy

    def _evaluate(self) -> Tuple[float, float]:
        """
        Evaluate the model on test data.

        Returns:
            Loss and accuracy
        """
        self.model.eval()
        criterion = nn.CrossEntropyLoss()

        total_loss = 0.0
        correct = 0
        total = 0

        with torch.no_grad():
            for batch in self.testloader:
                images, labels = batch
                images, labels = images.to(self.device), labels.to(self.device)

                outputs = self.model(images)
                loss = criterion(outputs, labels)

                total_loss += loss.item()
                _, predicted = outputs.max(1)
                total += labels.size(0)
                correct += predicted.eq(labels).sum().item()

        avg_loss = total_loss / len(self.testloader)
        accuracy = correct / total

        return avg_loss, accuracy


def create_client_fn(
    model_fn: Callable[[], nn.Module],
    load_data_fn: Callable[[int, int], Tuple[DataLoader, DataLoader]],
    num_clients: int,
    device: torch.device,
    local_epochs: int = 1,
    learning_rate: float = 0.01,
) -> Callable[[Context], Client]:
    """
    Create a client function for Flower simulation.

    Uses the modern Flower API with Context-based client_fn signature.

    Args:
        model_fn: Function that returns a new model instance
        load_data_fn: Function that loads data for a partition
        num_clients: Total number of clients
        device: Device to run on
        local_epochs: Number of local epochs
        learning_rate: Learning rate

    Returns:
        Client function that takes Context and returns Client
    """

    def client_fn(context: Context) -> Client:
        """Create a Flower client for the given context."""
        # Get partition ID from context (node_id is the partition/client ID)
        partition_id = context.node_config.get("partition-id")
        if partition_id is None:
            # Fallback: use node_id as partition_id
            partition_id = int(context.node_id) % num_clients

        # Create a new model for this client
        model = model_fn()

        # Load data partition for this client
        trainloader, testloader = load_data_fn(int(partition_id), num_clients)

        # Create NumPyClient and convert to Client
        numpy_client = FlowerClient(
            model=model,
            trainloader=trainloader,
            testloader=testloader,
            device=device,
            local_epochs=local_epochs,
            learning_rate=learning_rate,
        )

        # Convert NumPyClient to Client (required by modern Flower API)
        return numpy_client.to_client()

    return client_fn
