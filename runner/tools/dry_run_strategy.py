"""Import a strategy module and report what it actually builds, without training.

This catches the failure mode that costs the most: a get_strategy() that returns
a working strategy but omits evaluate_metrics_aggregation_fn. The run then trains
correctly and records no eval metrics at all, which looks identical to a model
that failed to learn -- except you only find out after the run finishes.

    python runner/tools/dry_run_strategy.py <file_path>

Runs in its own process, so importing the module cannot disturb a caller.
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: dry_run_strategy.py <path>"}))
        return 2

    path = Path(sys.argv[1])
    if not path.is_absolute():
        path = PROJECT_ROOT / path

    if not path.exists():
        print(json.dumps({"ok": False, "error": f"File not found: {path}"}))
        return 0

    from runner.core.module_loader import ModuleLoader

    loader = ModuleLoader(PROJECT_ROOT, experiment_id="dry_run")
    try:
        module = loader.load_module(str(path), "user_algorithm")
        if module is None:
            print(json.dumps({"ok": False, "error": "Module failed validation or import."}))
            return 0

        strategy_fn = loader.extract_strategy(module)
        if strategy_fn is None:
            print(json.dumps({"ok": False, "error": "No get_strategy() found in the module."}))
            return 0

        strategy = strategy_fn()

        # The four callbacks the platform relies on. Any left unset are injected
        # at run time, but knowing which were missing is the useful signal.
        callbacks = {
            name: getattr(strategy, name, None) is not None
            for name in (
                "on_fit_config_fn",
                "on_evaluate_config_fn",
                "fit_metrics_aggregation_fn",
                "evaluate_metrics_aggregation_fn",
            )
        }

        warnings = []
        if not callbacks["evaluate_metrics_aggregation_fn"]:
            warnings.append(
                "The strategy does not define evaluate_metrics_aggregation_fn. The platform "
                "injects a default, so eval_accuracy will still be recorded -- but if you "
                "return custom evaluation metrics, aggregate them yourself."
            )
        if not callbacks["fit_metrics_aggregation_fn"]:
            warnings.append(
                "No fit_metrics_aggregation_fn; the platform's weighted-mean default is used."
            )

        print(json.dumps({
            "ok": True,
            "strategyClass": type(strategy).__name__,
            "baseClasses": [c.__name__ for c in type(strategy).__mro__[1:4]],
            "definesCallbacks": callbacks,
            "warnings": warnings,
            "attributes": {
                key: float(value)
                for key, value in vars(strategy).items()
                if isinstance(value, (int, float)) and not key.startswith("_")
            },
        }))
        return 0

    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        return 0
    finally:
        loader.cleanup()


if __name__ == "__main__":
    sys.exit(main())
