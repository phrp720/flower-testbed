"""
FlowerClient - PyTorch client implementation for Flower federated learning.
"""

import copy
import os
from collections import OrderedDict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

import flwr as fl
from flwr.client import Client
from flwr.common import NDArrays, Scalar, Context

from .evaluate import evaluate_model


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
        partition_id: Optional[int] = None,
        state_dir: Optional[Path] = None,
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
        # Flower's client id is a random node identifier, not the data partition.
        # Reporting the partition explicitly is what lets analysis line a client's
        # model up with the data it actually trained on.
        self.partition_id = partition_id
        # Where per-client state that must survive between rounds is kept
        # (MOON's previous local model). Simulation recreates the client every
        # round, so it cannot live on the object.
        self.state_dir = Path(state_dir) if state_dir is not None else None

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

        # FedProx sends proximal_mu in the fit config; the proximal term itself
        # has to be applied here, on the client. Without it FedProx trains
        # exactly like FedAvg and only the strategy name differs.
        proximal_mu = float(config.get("proximal_mu", 0.0))
        weight_decay = float(config.get("weight_decay", 0.0))

        # MOON (Li et al., CVPR 2021) model-contrastive term, off unless the
        # fit config carries moon_mu > 0.
        moon_mu = float(config.get("moon_mu", 0.0))
        moon_temperature = float(config.get("moon_temperature", 0.5))

        # Train the model
        train_loss, train_acc = self._train(
            local_epochs, learning_rate,
            proximal_mu=proximal_mu, weight_decay=weight_decay,
            moon_mu=moon_mu, moon_temperature=moon_temperature,
        )

        # Return updated parameters, number of samples, and metrics
        return (
            self.get_parameters(config={}),
            len(self.trainloader.dataset),
            {
                "train_loss": float(train_loss),
                "train_accuracy": float(train_acc),
                # Reported so analysis can tie this client's model back to the
                # data it trained on. Flower's client id is a random node
                # identifier and carries no partition information.
                **({"partition_id": int(self.partition_id)} if self.partition_id is not None else {}),
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
            {
                "eval_accuracy": float(accuracy),
                **({"partition_id": int(self.partition_id)} if self.partition_id is not None else {}),
            },
        )

    def _train(
        self,
        epochs: int,
        learning_rate: float,
        proximal_mu: float = 0.0,
        weight_decay: float = 0.0,
        moon_mu: float = 0.0,
        moon_temperature: float = 0.5,
    ) -> Tuple[float, float]:
        """
        Train the model for specified epochs.

        Args:
            epochs: Number of epochs to train
            learning_rate: Learning rate
            proximal_mu: FedProx coefficient; adds (mu/2)*||w - w_global||^2
            weight_decay: L2 regularisation passed to SGD
            moon_mu: MOON coefficient; adds mu * model-contrastive loss
            moon_temperature: MOON temperature tau

        Returns:
            Average loss and accuracy
        """
        self.model.train()
        criterion = nn.CrossEntropyLoss()
        optimizer = torch.optim.SGD(
            self.model.parameters(),
            lr=learning_rate,
            momentum=0.9,
            weight_decay=weight_decay,
        )
        global_params = (
            [p.detach().clone() for p in self.model.parameters()]
            if proximal_mu > 0 else None
        )

        moon = moon_mu > 0
        if moon:
            global_net, prev_net = self._moon_reference_models()

        cos = nn.CosineSimilarity(dim=-1)

        total_loss = 0.0
        correct = 0
        total = 0

        for _ in range(epochs):
            for batch in self.trainloader:
                images, labels = batch
                images, labels = images.to(self.device), labels.to(self.device)

                optimizer.zero_grad()
                if moon:
                    z, outputs = self.model.forward_with_projection(images)
                else:
                    outputs = self.model(images)
                loss = criterion(outputs, labels)
                if moon:
                    # Positive pair: this model vs the global model; negative
                    # pair: this model vs this client's previous local model.
                    with torch.no_grad():
                        z_glob, _ = global_net.forward_with_projection(images)
                        z_prev, _ = prev_net.forward_with_projection(images)
                    sims = torch.stack(
                        [cos(z, z_glob), cos(z, z_prev)], dim=1
                    ) / moon_temperature
                    targets = torch.zeros(sims.size(0), dtype=torch.long, device=self.device)
                    loss = loss + moon_mu * criterion(sims, targets)
                if global_params is not None:
                    proximal = sum(
                        (w - g).pow(2).sum()
                        for w, g in zip(self.model.parameters(), global_params)
                    )
                    loss = loss + (proximal_mu / 2.0) * proximal
                loss.backward()
                optimizer.step()

                total_loss += loss.item()
                _, predicted = outputs.max(1)
                total += labels.size(0)
                correct += predicted.eq(labels).sum().item()

        avg_loss = total_loss / len(self.trainloader) / epochs
        accuracy = correct / total

        if moon:
            self._save_moon_state()

        return avg_loss, accuracy

    def _moon_state_path(self) -> Path:
        if self.state_dir is None or self.partition_id is None:
            raise RuntimeError(
                "MOON needs a per-client state directory and partition id to keep "
                "the previous local model between rounds."
            )
        return self.state_dir / f"moon_prev_partition_{int(self.partition_id)}.pt"

    def _moon_reference_models(self) -> Tuple[nn.Module, nn.Module]:
        """Frozen copies of the global model (just loaded) and this client's
        previous local model. Before a client has trained once, the previous
        model is the global model, as in the MOON reference code."""
        if not hasattr(self.model, "forward_with_projection"):
            raise RuntimeError(
                "MOON (moon_mu > 0) needs the model to define "
                "forward_with_projection(x) -> (projection, logits)."
            )
        global_net = copy.deepcopy(self.model).eval()
        prev_net = copy.deepcopy(self.model).eval()
        path = self._moon_state_path()
        if path.exists():
            prev_net.load_state_dict(torch.load(path, map_location=self.device))
        for net in (global_net, prev_net):
            for p in net.parameters():
                p.requires_grad_(False)
        return global_net, prev_net

    def _save_moon_state(self) -> None:
        path = self._moon_state_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        torch.save(self.model.state_dict(), tmp)
        os.replace(tmp, path)

    def _evaluate(self) -> Tuple[float, float]:
        """
        Evaluate the model on test data.

        Delegates to the shared implementation so a standalone evaluation of a
        saved checkpoint produces numbers comparable with these.

        Returns:
            Loss and accuracy
        """
        loss, accuracy, _ = evaluate_model(self.model, self.testloader, self.device)
        return loss, accuracy


def create_client_fn(
    model_fn: Callable[[], nn.Module],
    load_data_fn: Callable[[int, int], Tuple[DataLoader, DataLoader]],
    num_clients: int,
    device: torch.device,
    local_epochs: int = 1,
    learning_rate: float = 0.01,
    client_overrides: Optional[Dict[Any, Dict[str, Any]]] = None,
    state_dir: Optional[Path] = None,
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
        client_overrides: Per-partition hyperparameter overrides, keyed by
            partition id. Lets individual nodes train differently from the rest,
            which is what makes heterogeneous-client experiments possible.

    Returns:
        Client function that takes Context and returns Client
    """
    overrides = client_overrides or {}

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

        # Apply any per-node overrides. JSON object keys are strings, so accept
        # either form rather than silently missing the match.
        override = overrides.get(int(partition_id)) or overrides.get(str(partition_id)) or {}
        node_epochs = int(override.get("local_epochs", local_epochs))
        node_lr = float(override.get("learning_rate", learning_rate))
        if override:
            print(f"[Client {partition_id}] overrides: epochs={node_epochs} lr={node_lr}")

        # Create NumPyClient and convert to Client
        numpy_client = FlowerClient(
            model=model,
            trainloader=trainloader,
            testloader=testloader,
            device=device,
            local_epochs=node_epochs,
            learning_rate=node_lr,
            partition_id=int(partition_id),
            state_dir=state_dir,
        )

        # Convert NumPyClient to Client (required by modern Flower API)
        return numpy_client.to_client()

    return client_fn
