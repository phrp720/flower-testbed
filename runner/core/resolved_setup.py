"""
What a run is actually made of, recorded once at start-up.

The experiment row stores what was *asked for*: four optional file paths and a
config blob. That is not the same as what ran. An uploaded strategy that raises
falls back to FedAvg; an uploaded dataset module chooses its own partitioner in
code and never reports it; leaving every field empty silently means CIFAR-10,
FedAvg and IID. Reading the row therefore tells you the intent and not the
outcome, and the two differ in exactly the cases worth looking at.

Everything here is resolved from the objects the orchestrator has already built,
except the partitioner inside a user's load_data(), which is never handed back.
That one is read off the source, and is reported as a weaker claim because it
is one: a static read cannot see a branch.
"""

import ast
import os
from typing import Any, Dict, Optional


def _class_name(obj: Any) -> Optional[str]:
    return type(obj).__name__ if obj is not None else None


def scan_partitioners(path: str) -> list:
    """
    Partitioner classes a dataset module constructs.

    Parsed rather than imported: importing runs module-level code, and this is
    called to *describe* an upload, not to trust it. Returns every distinct
    `SomethingPartitioner(...)` call in source order.
    """
    try:
        with open(path, "r", encoding="utf-8") as handle:
            tree = ast.parse(handle.read())
    except (OSError, SyntaxError) as error:
        print(f"[Resolved] Could not scan {os.path.basename(path)}: {error}")
        return []

    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = getattr(func, "id", None) or getattr(func, "attr", None)
        if name and name.endswith("Partitioner") and name not in found:
            found.append(name)
    return found


def resolve(
    *,
    strategy: Any,
    strategy_name: Optional[str],
    algorithm_path: Optional[str],
    dataset_path: Optional[str],
    model: Any,
    partitioner: Any = None,
    dataset_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build the block stored at custom_config.resolved."""
    setup: Dict[str, Any] = {
        "strategy": _class_name(strategy),
        # How it got there, which is what makes a silent fallback visible: an
        # uploaded module that failed still reports strategy "FedAvg", and this
        # field is what says it was not supposed to be.
        "strategySource": "uploaded module" if algorithm_path else (strategy_name or "fedavg"),
        "model": _class_name(model),
    }

    if dataset_path:
        setup["dataset"] = "uploaded module"
        referenced = scan_partitioners(dataset_path)
        # Named as a reference, not a fact. The module picks its own split and
        # never tells us which branch it took.
        setup["partitionerReferenced"] = referenced or None
    else:
        setup["dataset"] = dataset_id or "built-in"
        setup["partitioner"] = _class_name(partitioner)

    return setup
