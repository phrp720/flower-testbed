"""
Custom Configuration Template for Flower Federated Learning

Instructions:
1. Define your hyperparameters in the CONFIG dictionary
2. The framework will merge these with defaults

You can also use JSON or YAML files instead of Python:
- config.json: {"batch_size": 32, "learning_rate": 0.01}
- config.yaml: batch_size: 32\n  learning_rate: 0.01
"""

# Configuration dictionary
# All values here will override defaults
CONFIG = {
    # Training parameters
    "batch_size": 32,
    "learning_rate": 0.01,
    "local_epochs": 1,
    "optimizer": "sgd",       # "sgd", "adam", "adamw"
    "momentum": 0.9,          # For SGD
    "weight_decay": 0.0001,   # L2 regularization

    # Learning rate schedule (optional)
    "lr_scheduler": None,     # "step", "cosine", None
    "lr_step_size": 10,       # For step scheduler
    "lr_gamma": 0.1,          # For step scheduler

    # Data augmentation (optional)
    "augmentation": {
        "horizontal_flip": True,
        "random_crop": True,
        "color_jitter": False,
    },

    # Model parameters (if using default model)
    "num_classes": 10,
    "dropout": 0.25,

    # Federated learning parameters
    "client_fraction": 0.5,   # Fraction of clients per round
    "min_fit_clients": 2,     # Minimum clients for training
    "min_evaluate_clients": 2, # Minimum clients for evaluation

    # Optional: Custom strategy parameters
    "strategy": "fedavg",     # "fedavg", "fedprox", "fedadam"
    "proximal_mu": 0.1,       # For FedProx
}


# Alternative: Define as a function for dynamic configuration
def get_config(num_rounds: int = 10, num_clients: int = 10) -> dict:
    """
    Generate configuration dynamically.

    Args:
        num_rounds: Total number of federated rounds
        num_clients: Total number of clients

    Returns:
        Configuration dictionary
    """
    config = {
        "batch_size": 32,
        "learning_rate": 0.01,
        "local_epochs": 1,

        # Scale client fraction based on number of clients
        "client_fraction": min(0.5, max(2, num_clients // 2) / num_clients),

        # Adjust learning rate for longer training
        "lr_decay_per_round": 0.99 if num_rounds > 20 else 1.0,
    }

    return config
