"""List the built-in aggregation strategies and their tunable parameters.

Prints one JSON line, following runner/core/resources.py.

    python runner/tools/strategy_info.py
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def main() -> int:
    try:
        from runner.pytorch.server import list_builtin_strategies
        print(json.dumps({"ok": True, "strategies": list_builtin_strategies()}))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
