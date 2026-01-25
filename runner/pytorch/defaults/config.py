"""
Default configuration for PyTorch federated learning.
"""

# Default hyperparameters
DEFAULT_CONFIG = {
    # Training parameters
    "batch_size": 32,
    "learning_rate": 0.01,
    "local_epochs": 1,
    "optimizer": "sgd",
    "momentum": 0.9,

    # Model parameters
    "num_classes": 10,

    # Data parameters
    "normalize_mean": (0.4914, 0.4822, 0.4465),
    "normalize_std": (0.2470, 0.2435, 0.2616),

    # Federated learning parameters
    "client_fraction": 0.5,
    "min_fit_clients": 2,
    "min_evaluate_clients": 2,
}
