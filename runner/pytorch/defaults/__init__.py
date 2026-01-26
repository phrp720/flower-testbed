"""
Default implementations for PyTorch federated learning.
"""

from .model import Net, get_model
from .dataset import load_data
from .config import DEFAULT_CONFIG

__all__ = ['Net', 'get_model', 'load_data', 'DEFAULT_CONFIG']
