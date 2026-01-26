"""
ModuleLoader - Dynamic Python module loading for user-provided files.
"""

import sys
import json
import importlib.util
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Type

import torch.nn as nn


class ModuleLoader:
    """Dynamically loads Python modules and extracts components."""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self._loaded_modules = {}

    def load_module(self, file_path: str, module_name: str) -> Optional[Any]:
        """
        Dynamically load a Python module from file path.

        Args:
            file_path: Relative path from project root
            module_name: Name to give the module

        Returns:
            Loaded module or None if not found
        """
        if not file_path:
            return None

        full_path = self.project_root / file_path
        if not full_path.exists():
            print(f"[ModuleLoader] File not found: {file_path}")
            return None

        try:
            spec = importlib.util.spec_from_file_location(module_name, full_path)
            if spec is None or spec.loader is None:
                print(f"[ModuleLoader] Failed to create spec for: {file_path}")
                return None

            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)

            self._loaded_modules[module_name] = module
            print(f"[ModuleLoader] Loaded module: {file_path}")
            return module

        except Exception as e:
            print(f"[ModuleLoader] Error loading {file_path}: {e}")
            return None

    def extract_model(self, module: Any) -> Optional[Callable[[], nn.Module]]:
        """
        Extract model factory from module.

        Looks for:
        1. get_model() function
        2. Net class

        Args:
            module: Loaded Python module

        Returns:
            Callable that returns a model instance
        """
        if module is None:
            return None

        # Look for get_model() function
        if hasattr(module, 'get_model') and callable(module.get_model):
            return module.get_model

        # Look for Net class
        if hasattr(module, 'Net') and isinstance(module.Net, type):
            return module.Net

        # Look for Model class
        if hasattr(module, 'Model') and isinstance(module.Model, type):
            return module.Model

        print(f"[ModuleLoader] No model found in module (expected get_model() or Net class)")
        return None

    def extract_dataset_loader(self, module: Any) -> Optional[Callable]:
        """
        Extract dataset loader function from module.

        Looks for load_data(partition_id, num_partitions) function.

        Args:
            module: Loaded Python module

        Returns:
            load_data function or None
        """
        if module is None:
            return None

        if hasattr(module, 'load_data') and callable(module.load_data):
            return module.load_data

        print(f"[ModuleLoader] No load_data() function found in module")
        return None

    def extract_strategy(self, module: Any) -> Optional[Callable]:
        """
        Extract strategy factory from module.

        Looks for get_strategy() function.

        Args:
            module: Loaded Python module

        Returns:
            get_strategy function or None
        """
        if module is None:
            return None

        if hasattr(module, 'get_strategy') and callable(module.get_strategy):
            return module.get_strategy

        print(f"[ModuleLoader] No get_strategy() function found in module")
        return None

    def extract_config(self, module_or_path: Any) -> Dict[str, Any]:
        """
        Extract configuration from module or file.

        Supports:
        - Python module with CONFIG dict
        - JSON file
        - YAML file

        Args:
            module_or_path: Loaded module or file path

        Returns:
            Configuration dictionary
        """
        # If it's a string path, try to load the file directly
        if isinstance(module_or_path, str):
            return self._load_config_file(module_or_path)

        # If it's a module, look for CONFIG dict
        if module_or_path is not None:
            if hasattr(module_or_path, 'CONFIG') and isinstance(module_or_path.CONFIG, dict):
                return module_or_path.CONFIG

            if hasattr(module_or_path, 'config') and isinstance(module_or_path.config, dict):
                return module_or_path.config

        return {}

    def _load_config_file(self, file_path: str) -> Dict[str, Any]:
        """Load configuration from a file (JSON/YAML)."""
        if not file_path:
            return {}

        full_path = self.project_root / file_path
        if not full_path.exists():
            return {}

        suffix = full_path.suffix.lower()

        try:
            if suffix == '.json':
                with open(full_path, 'r') as f:
                    return json.load(f)

            elif suffix in ['.yaml', '.yml']:
                try:
                    import yaml
                    with open(full_path, 'r') as f:
                        return yaml.safe_load(f) or {}
                except ImportError:
                    print("[ModuleLoader] PyYAML not installed, cannot load YAML config")
                    return {}

            elif suffix == '.py':
                # Load as Python module
                module = self.load_module(file_path, 'user_config')
                return self.extract_config(module)

        except Exception as e:
            print(f"[ModuleLoader] Error loading config from {file_path}: {e}")

        return {}
