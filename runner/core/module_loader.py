"""
ModuleLoader - Dynamic Python module loading for user-provided files.
"""

import ast
import os
import shutil
import sys
import json
import importlib.util
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Set, Tuple, Type

import torch.nn as nn

# Expected top-level definitions per module type
_EXPECTED_EXPORTS = {
    'user_model': {
        'functions': {'get_model'},
        'classes': {'Net', 'Model'},
    },
    'user_dataset': {
        'functions': {'load_data'},
        'classes': set(),
    },
    'user_algorithm': {
        'functions': {'get_strategy'},
        'classes': set(),
    },
    'user_config': {
        'functions': {'get_config'},
        'classes': set(),
        'variables': {'CONFIG', 'config'},
    },
}


class ModuleLoader:
    """Dynamically loads Python modules and extracts components."""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self._loaded_modules = {}
        # Cache dir for modules so Ray workers can import them by name
        self._module_cache = project_root / '.module_cache'
        self._module_cache.mkdir(exist_ok=True)
        cache_str = str(self._module_cache)
        # Add to sys.path for the main process
        if cache_str not in sys.path:
            sys.path.insert(0, cache_str)
        # Add to PYTHONPATH so Ray worker processes inherit it
        pythonpath = os.environ.get('PYTHONPATH', '')
        if cache_str not in pythonpath:
            os.environ['PYTHONPATH'] = cache_str + os.pathsep + pythonpath if pythonpath else cache_str

    @staticmethod
    def _validate_structure(full_path: Path, module_name: str) -> Tuple[bool, str]:
        """
        Parse the file with AST (without executing) and check it defines at least
        one of the expected top-level exports for its module type.

        Returns:
            (is_valid, error_message)
        """
        expected = _EXPECTED_EXPORTS.get(module_name)
        if expected is None:
            return True, ""

        try:
            source = full_path.read_text(encoding='utf-8')
        except Exception as e:
            return False, f"Cannot read file: {e}"

        try:
            tree = ast.parse(source, filename=str(full_path))
        except SyntaxError as e:
            return False, f"Syntax error in uploaded file (line {e.lineno}): {e.msg}"

        # Collect top-level names
        defined_functions: Set[str] = set()
        defined_classes: Set[str] = set()
        defined_variables: Set[str] = set()

        for node in ast.iter_child_nodes(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                defined_functions.add(node.name)
            elif isinstance(node, ast.ClassDef):
                defined_classes.add(node.name)
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        defined_variables.add(target.id)

        expected_funcs = expected.get('functions', set())
        expected_classes = expected.get('classes', set())
        expected_vars = expected.get('variables', set())

        found = (
            (expected_funcs & defined_functions)
            | (expected_classes & defined_classes)
            | (expected_vars & defined_variables)
        )

        if found:
            return True, ""

        all_expected = sorted(expected_funcs | expected_classes | expected_vars)
        return False, (
            f"File does not define any of the expected exports: {', '.join(all_expected)}. "
            f"Please check your file and upload again."
        )

    def load_module(self, file_path: str, module_name: str) -> Optional[Any]:
        """
        Dynamically load a Python module from file path.

        Validates the file structure before executing it.

        Args:
            file_path: Relative path from project root
            module_name: Name to give the module

        Returns:
            Loaded module or None if not found/invalid
        """
        if not file_path:
            return None

        full_path = self.project_root / file_path
        if not full_path.exists():
            print(f"[ModuleLoader] File not found: {file_path}")
            return None

        # Validate structure before executing
        is_valid, error = self._validate_structure(full_path, module_name)
        if not is_valid:
            print(f"[ModuleLoader] {error}")
            return None

        try:
            # Copy the file as {module_name}.py into the cache dir so that
            # Ray workers (separate processes) can import it by name.
            cached_path = self._module_cache / f"{module_name}.py"
            shutil.copy2(full_path, cached_path)

            spec = importlib.util.spec_from_file_location(module_name, cached_path)
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
