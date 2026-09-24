"""
Server - Strategy creation and metrics aggregation for Flower server.
"""

import inspect
from typing import List, Tuple, Dict, Any, Optional, Callable

from flwr.common import Metrics, Parameters
from flwr.server.strategy import (
    FedAdagrad,
    FedAdam,
    FedAvg,
    FedProx,
    FedYogi,
    Strategy,
)


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


# Built-in aggregation strategies, so changing how local models are merged does
# not require uploading a Python file. The FedOpt family keeps server-side
# optimiser state and therefore needs the initial global parameters.
_BUILTIN_STRATEGIES = {
    "fedavg": {"cls": FedAvg, "needs_initial_parameters": False, "params": {}},
    "fedprox": {
        "cls": FedProx,
        "needs_initial_parameters": False,
        "params": {"proximal_mu": 0.1},
    },
    "fedadam": {
        "cls": FedAdam,
        "needs_initial_parameters": True,
        "params": {"eta": 1e-1, "eta_l": 1e-1, "beta_1": 0.9, "beta_2": 0.99, "tau": 1e-9},
    },
    "fedadagrad": {
        "cls": FedAdagrad,
        "needs_initial_parameters": True,
        "params": {"eta": 1e-1, "eta_l": 1e-1, "tau": 1e-9},
    },
    "fedyogi": {
        "cls": FedYogi,
        "needs_initial_parameters": True,
        "params": {"eta": 1e-2, "eta_l": 0.0316, "beta_1": 0.9, "beta_2": 0.99, "tau": 1e-3},
    },
}


def list_builtin_strategies() -> Dict[str, Dict[str, Any]]:
    """Strategy names and their tunable parameters, for the API and the agent."""
    return {
        name: {
            "class": spec["cls"].__name__,
            "parameters": dict(spec["params"]),
            "needs_initial_parameters": spec["needs_initial_parameters"],
        }
        for name, spec in _BUILTIN_STRATEGIES.items()
    }


def _inject_defaults(
    strategy: Strategy,
    on_fit_config_fn: Optional[Callable[[int], Dict[str, Any]]],
    on_evaluate_config_fn: Optional[Callable[[int], Dict[str, Any]]],
) -> Strategy:
    """
    Attach the platform's per-round config and metric aggregators to a strategy
    that does not define its own.

    Without this, a user-supplied get_strategy() silently loses
    evaluate_metrics_aggregation_fn, and the run records no eval_accuracy at all.
    The training is fine; every chart is empty and final_accuracy is null, which
    reads exactly like a model that failed to learn. Only fill in what the
    strategy left unset, so a deliberate choice is never overridden.
    """
    defaults = {
        "on_fit_config_fn": on_fit_config_fn,
        "on_evaluate_config_fn": on_evaluate_config_fn,
        "fit_metrics_aggregation_fn": fit_metrics_aggregation_fn,
        "evaluate_metrics_aggregation_fn": evaluate_metrics_aggregation_fn,
    }

    for attribute, value in defaults.items():
        if value is None:
            continue
        if getattr(strategy, attribute, None) is None:
            setattr(strategy, attribute, value)
            print(f"[Server] Injected default {attribute} into {type(strategy).__name__}")

    return strategy


def create_strategy(
    num_clients: int,
    client_fraction: float,
    strategy_fn: Optional[Callable[[], Strategy]] = None,
    on_fit_config_fn: Optional[Callable[[int], Dict[str, Any]]] = None,
    on_evaluate_config_fn: Optional[Callable[[int], Dict[str, Any]]] = None,
    strategy_name: Optional[str] = None,
    strategy_params: Optional[Dict[str, Any]] = None,
    initial_parameters: Optional[Parameters] = None,
) -> Strategy:
    """
    Create a Flower strategy.

    Precedence: an uploaded strategy module, then a named built-in, then FedAvg.

    Args:
        num_clients: Total number of clients
        client_fraction: Fraction of clients to sample each round
        strategy_fn: Optional function that returns a custom strategy
        on_fit_config_fn: Optional function to create fit config per round
        on_evaluate_config_fn: Optional function to create evaluate config per round
        strategy_name: Optional built-in strategy name (fedavg, fedprox, fedadam, ...)
        strategy_params: Optional overrides for that strategy's parameters
        initial_parameters: Starting global parameters, required by the FedOpt family

    Returns:
        Flower Strategy instance
    """
    # If user provided a custom strategy, use it
    if strategy_fn is not None:
        try:
            strategy = strategy_fn()
        except Exception as e:
            raise RuntimeError(
                f"The uploaded strategy could not be created: {e}. "
                "The run was stopped."
            ) from e

        print(f"[Server] Using custom strategy: {type(strategy).__name__}")
        # A custom strategy still needs the platform's aggregators, or the
        # run produces no eval metrics.
        return _inject_defaults(strategy, on_fit_config_fn, on_evaluate_config_fn)

    # Calculate minimum clients
    min_clients = max(1, int(num_clients * client_fraction))

    common_kwargs = dict(
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

    requested = (strategy_name or "fedavg").lower()
    spec = _BUILTIN_STRATEGIES.get(requested)

    if spec is None:
        # Fatal for the same reason an uncreatable custom strategy is: a run
        # that quietly used FedAvg when asked for FedProx is a result that
        # cannot be trusted and does not announce itself.
        raise ValueError(
            f"Unknown strategy '{requested}'. Available: "
            + ", ".join(sorted(_BUILTIN_STRATEGIES))
        )

    kwargs = dict(common_kwargs)
    kwargs.update(spec["params"])
    if strategy_params:
        # Only accept parameters the strategy actually declares, so a typo fails
        # loudly here instead of as an opaque TypeError mid-run.
        accepted = set(inspect.signature(spec["cls"].__init__).parameters)
        for key, value in strategy_params.items():
            if key in accepted:
                kwargs[key] = value
            else:
                print(f"[Server] Ignoring unknown parameter '{key}' for {requested}")

    if spec["needs_initial_parameters"]:
        if initial_parameters is None:
            print(
                f"[Server] {requested} needs initial parameters and none were "
                "available. Falling back to FedAvg."
            )
            spec = _BUILTIN_STRATEGIES["fedavg"]
            requested = "fedavg"
            kwargs = dict(common_kwargs)
        else:
            kwargs["initial_parameters"] = initial_parameters

    try:
        strategy = spec["cls"](**kwargs)
    except Exception as e:
        print(f"[Server] Failed to build {requested} ({e}). Falling back to FedAvg.")
        strategy = FedAvg(**common_kwargs)
        requested = "fedavg"

    tuned = {k: v for k, v in kwargs.items() if k in spec["params"]}
    suffix = f" ({', '.join(f'{k}={v}' for k, v in tuned.items())})" if tuned else ""
    print(
        f"[Server] Using {type(strategy).__name__} strategy with "
        f"{client_fraction*100:.0f}% client fraction{suffix}"
    )
    return strategy
