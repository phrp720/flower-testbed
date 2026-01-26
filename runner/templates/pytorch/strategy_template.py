"""
Custom Strategy Template for Flower Federated Learning

Instructions:
1. Implement the get_strategy() function
2. Return a Flower Strategy instance

Available strategies from flwr.server.strategy:
- FedAvg: Federated Averaging (most common)
- FedProx: Adds proximal term for non-IID data
- FedAdam: Uses Adam optimizer on server
- FedAdagrad: Uses Adagrad optimizer on server
- FedYogi: Uses Yogi optimizer on server
- QFedAvg: Fair federated learning

You can also implement custom strategies by subclassing Strategy.
"""

from typing import List, Tuple, Dict, Optional, Union

from flwr.common import (
    Metrics,
    Parameters,
    FitIns,
    FitRes,
    EvaluateIns,
    EvaluateRes,
    Scalar,
    ndarrays_to_parameters,
    parameters_to_ndarrays,
)
from flwr.server.client_proxy import ClientProxy
from flwr.server.strategy import (
    FedAvg,
    FedProx,
    FedAdam,
    Strategy,
)


def fit_metrics_aggregation_fn(metrics: List[Tuple[int, Metrics]]) -> Metrics:
    """
    Aggregate training metrics from clients.

    Args:
        metrics: List of (num_examples, metrics_dict) from each client

    Returns:
        Aggregated metrics dictionary
    """
    if not metrics:
        return {}

    total_examples = sum([m[0] for m in metrics])
    aggregated = {}

    for num_examples, client_metrics in metrics:
        weight = num_examples / total_examples
        for key, value in client_metrics.items():
            if isinstance(value, (int, float)):
                if key not in aggregated:
                    aggregated[key] = 0.0
                aggregated[key] += float(value) * weight

    return aggregated


def evaluate_metrics_aggregation_fn(metrics: List[Tuple[int, Metrics]]) -> Metrics:
    """
    Aggregate evaluation metrics from clients.

    Args:
        metrics: List of (num_examples, metrics_dict) from each client

    Returns:
        Aggregated metrics dictionary
    """
    if not metrics:
        return {}

    total_examples = sum([m[0] for m in metrics])
    aggregated = {}

    for num_examples, client_metrics in metrics:
        weight = num_examples / total_examples
        for key, value in client_metrics.items():
            if isinstance(value, (int, float)):
                if key not in aggregated:
                    aggregated[key] = 0.0
                aggregated[key] += float(value) * weight

    return aggregated


def get_strategy() -> Strategy:
    """
    Create and return a Flower strategy.

    Returns:
        A configured Flower Strategy instance
    """
    # Example 1: Basic FedAvg
    strategy = FedAvg(
        fraction_fit=0.5,           # Sample 50% of clients for training
        fraction_evaluate=0.5,       # Sample 50% of clients for evaluation
        min_fit_clients=2,           # Minimum clients for training
        min_evaluate_clients=2,      # Minimum clients for evaluation
        min_available_clients=2,     # Minimum available clients
        fit_metrics_aggregation_fn=fit_metrics_aggregation_fn,
        evaluate_metrics_aggregation_fn=evaluate_metrics_aggregation_fn,
    )

    return strategy


# Example 2: FedProx for non-IID data
def get_fedprox_strategy() -> Strategy:
    """
    FedProx strategy for non-IID data distributions.

    FedProx adds a proximal term to the local objective to keep
    client models closer to the global model.
    """
    strategy = FedProx(
        fraction_fit=0.5,
        fraction_evaluate=0.5,
        min_fit_clients=2,
        min_evaluate_clients=2,
        min_available_clients=2,
        proximal_mu=0.1,  # Proximal term coefficient
        fit_metrics_aggregation_fn=fit_metrics_aggregation_fn,
        evaluate_metrics_aggregation_fn=evaluate_metrics_aggregation_fn,
    )

    return strategy


# Example 3: FedAdam for adaptive learning
def get_fedadam_strategy() -> Strategy:
    """
    FedAdam strategy with adaptive server-side optimization.
    """
    strategy = FedAdam(
        fraction_fit=0.5,
        fraction_evaluate=0.5,
        min_fit_clients=2,
        min_evaluate_clients=2,
        min_available_clients=2,
        eta=1e-3,       # Server learning rate
        eta_l=1e-2,     # Client learning rate
        beta_1=0.9,     # Adam beta_1
        beta_2=0.99,    # Adam beta_2
        tau=1e-3,       # Adam epsilon
        fit_metrics_aggregation_fn=fit_metrics_aggregation_fn,
        evaluate_metrics_aggregation_fn=evaluate_metrics_aggregation_fn,
    )

    return strategy


# Example 4: Custom Strategy
class CustomStrategy(FedAvg):
    """
    Example custom strategy extending FedAvg.

    Override methods to add custom behavior:
    - configure_fit: Customize training configuration per round
    - configure_evaluate: Customize evaluation configuration per round
    - aggregate_fit: Custom aggregation of training results
    - aggregate_evaluate: Custom aggregation of evaluation results
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.round_accuracies = []

    def configure_fit(
        self,
        server_round: int,
        parameters: Parameters,
        client_manager,
    ) -> List[Tuple[ClientProxy, FitIns]]:
        """
        Configure training for each client.

        Example: Decay learning rate over rounds.
        """
        # Get default configuration
        config = super().configure_fit(server_round, parameters, client_manager)

        # Modify config for each client
        modified_config = []
        for client, fit_ins in config:
            # Add custom config values
            fit_ins.config["server_round"] = server_round
            fit_ins.config["learning_rate"] = 0.01 * (0.99 ** server_round)  # LR decay
            modified_config.append((client, fit_ins))

        return modified_config

    def aggregate_evaluate(
        self,
        server_round: int,
        results: List[Tuple[ClientProxy, EvaluateRes]],
        failures: List[Union[Tuple[ClientProxy, EvaluateRes], BaseException]],
    ) -> Tuple[Optional[float], Dict[str, Scalar]]:
        """
        Aggregate evaluation results and track accuracy history.
        """
        # Call parent aggregation
        aggregated = super().aggregate_evaluate(server_round, results, failures)

        if aggregated is not None:
            loss, metrics = aggregated
            if "eval_accuracy" in metrics:
                self.round_accuracies.append(metrics["eval_accuracy"])
                print(f"[CustomStrategy] Round {server_round} accuracy: {metrics['eval_accuracy']:.4f}")

        return aggregated
