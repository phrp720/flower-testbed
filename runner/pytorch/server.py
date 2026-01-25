"""
Server - Strategy creation and metrics aggregation for Flower server.
"""

from typing import List, Tuple, Dict, Any, Optional, Callable

from flwr.common import Metrics
from flwr.server.strategy import FedAvg, Strategy


def fit_metrics_aggregation_fn(metrics: List[Tuple[int, Metrics]]) -> Metrics:
    """
    Aggregate fit metrics from clients.

    This function is called after each round to aggregate training metrics
    from all participating clients.

    Args:
        metrics: List of (num_examples, metrics_dict) tuples from clients

    Returns:
        Aggregated metrics dictionary
    """
    if not metrics:
        return {}

    total_examples = sum([m[0] for m in metrics])
    if total_examples == 0:
        return {}

    aggregated: Dict[str, float] = {}

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

    This function is called after each round to aggregate evaluation metrics
    from all participating clients.

    Args:
        metrics: List of (num_examples, metrics_dict) tuples from clients

    Returns:
        Aggregated metrics dictionary
    """
    if not metrics:
        return {}

    total_examples = sum([m[0] for m in metrics])
    if total_examples == 0:
        return {}

    aggregated: Dict[str, float] = {}

    for num_examples, client_metrics in metrics:
        weight = num_examples / total_examples
        for key, value in client_metrics.items():
            if isinstance(value, (int, float)):
                if key not in aggregated:
                    aggregated[key] = 0.0
                aggregated[key] += float(value) * weight

    return aggregated


def create_strategy(
    num_clients: int,
    client_fraction: float,
    strategy_fn: Optional[Callable[[], Strategy]] = None,
    on_fit_config_fn: Optional[Callable[[int], Dict[str, Any]]] = None,
    on_evaluate_config_fn: Optional[Callable[[int], Dict[str, Any]]] = None,
) -> Strategy:
    """
    Create a Flower strategy.

    If a custom strategy function is provided, use it.
    Otherwise, create a FedAvg strategy with sensible defaults.

    Args:
        num_clients: Total number of clients
        client_fraction: Fraction of clients to sample each round
        strategy_fn: Optional function that returns a custom strategy
        on_fit_config_fn: Optional function to create fit config per round
        on_evaluate_config_fn: Optional function to create evaluate config per round

    Returns:
        Flower Strategy instance
    """
    # If user provided a custom strategy, use it
    if strategy_fn is not None:
        try:
            strategy = strategy_fn()
            print(f"[Server] Using custom strategy: {type(strategy).__name__}")
            return strategy
        except Exception as e:
            print(f"[Server] Failed to create custom strategy: {e}")
            print("[Server] Falling back to FedAvg")

    # Calculate minimum clients
    min_clients = max(1, int(num_clients * client_fraction))

    # Create FedAvg strategy
    strategy = FedAvg(
        fraction_fit=client_fraction,
        fraction_evaluate=client_fraction,
        min_fit_clients=min_clients,
        min_evaluate_clients=min_clients,
        min_available_clients=num_clients,
        fit_metrics_aggregation_fn=fit_metrics_aggregation_fn,
        evaluate_metrics_aggregation_fn=evaluate_metrics_aggregation_fn,
        on_fit_config_fn=on_fit_config_fn,
        on_evaluate_config_fn=on_evaluate_config_fn,
    )

    print(f"[Server] Using FedAvg strategy with {client_fraction*100:.0f}% client fraction")
    return strategy
