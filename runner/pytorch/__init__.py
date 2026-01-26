"""
PyTorch-specific Flower federated learning components.
"""

from .client import FlowerClient, create_client_fn
from .server import create_strategy, fit_metrics_aggregation_fn, evaluate_metrics_aggregation_fn
from .simulation import SimulationOrchestrator

__all__ = [
    'FlowerClient',
    'create_client_fn',
    'create_strategy',
    'fit_metrics_aggregation_fn',
    'evaluate_metrics_aggregation_fn',
    'SimulationOrchestrator',
]
