"""Validate a user-supplied module without importing it.

Prints a single JSON line, following the convention set by runner/core/resources.py
-- the only other machine-readable stdout surface in the runner.

Usage:
    python runner/tools/validate_module.py <file_path> <module_name>

module_name is one of: user_model, user_dataset, user_algorithm, user_config.

Validation is purely static (ast.parse), so nothing in the file is executed.
This is what lets the agent check code it just generated before spending a
training run on it.
"""

import ast
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from runner.core.module_loader import _EXPECTED_EXPORTS, ModuleLoader  # noqa: E402


def collect_definitions(source: str) -> dict:
    """Top-level names the file defines, for reporting back to the caller."""
    tree = ast.parse(source)
    functions, classes, variables = [], [], []

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node.name)
        elif isinstance(node, ast.ClassDef):
            classes.append(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    variables.append(target.id)

    return {"functions": functions, "classes": classes, "variables": variables}


def main() -> int:
    if len(sys.argv) != 3:
        print(json.dumps({"valid": False, "error": "usage: validate_module.py <path> <module_name>"}))
        return 2

    file_path, module_name = sys.argv[1], sys.argv[2]

    if module_name not in _EXPECTED_EXPORTS:
        print(json.dumps({
            "valid": False,
            "error": f"Unknown module type '{module_name}'. Expected one of: "
                     + ", ".join(sorted(_EXPECTED_EXPORTS)),
        }))
        return 0

    path = Path(file_path)
    if not path.is_absolute():
        path = PROJECT_ROOT / path

    if not path.exists():
        print(json.dumps({"valid": False, "error": f"File not found: {file_path}"}))
        return 0

    is_valid, error = ModuleLoader._validate_structure(path, module_name)

    result = {
        "valid": bool(is_valid),
        "moduleName": module_name,
        "path": str(path),
        "expected": {k: sorted(v) for k, v in _EXPECTED_EXPORTS[module_name].items()},
    }

    if not is_valid:
        result["error"] = error
    else:
        try:
            result["defines"] = collect_definitions(path.read_text())
        except Exception:
            pass

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
