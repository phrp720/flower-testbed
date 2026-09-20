"""Describe a saved checkpoint without shipping its tensors anywhere.

Prints a single JSON line with the round, the metrics stored alongside the
weights, and the shape of every parameter tensor. A checkpoint is a pickled
state dict of many megabytes; its structure is what is useful to read, the
bytes never are.

Usage:
    python runner/tools/inspect_checkpoint.py <checkpoint_path>
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: inspect_checkpoint.py <path>"}))
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        print(json.dumps({"ok": False, "error": f"Checkpoint not found: {path}"}))
        return 0

    try:
        import torch
    except ImportError:
        print(json.dumps({"ok": False, "error": "PyTorch is not available in this environment."}))
        return 0

    try:
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        return 0

    state_dict = checkpoint.get("model_state_dict", {}) if isinstance(checkpoint, dict) else {}

    layers = []
    total_params = 0
    # The parameters' own size, which is what a federated round actually moves.
    # The file on disk is larger: it carries a pickle envelope and the stored
    # metrics, neither of which would ever cross a network.
    total_bytes = 0
    for name, tensor in state_dict.items():
        try:
            shape = list(tensor.shape)
            count = int(tensor.numel())
            nbytes = int(tensor.numel() * tensor.element_size())
            total_params += count
            total_bytes += nbytes
            layers.append({
                "name": name,
                "shape": shape,
                "params": count,
                "bytes": nbytes,
                "dtype": str(tensor.dtype),
                # A mean absolute value near zero across every layer usually
                # means the weights never moved.
                "absMean": float(tensor.abs().float().mean().item()) if count else 0.0,
            })
        except Exception:
            layers.append({"name": name, "shape": None, "params": None})

    print(json.dumps({
        "ok": True,
        "path": str(path),
        "fileSizeBytes": path.stat().st_size,
        "round": checkpoint.get("round") if isinstance(checkpoint, dict) else None,
        "metrics": checkpoint.get("metrics") if isinstance(checkpoint, dict) else None,
        "totalParameters": total_params,
        "parameterBytes": total_bytes,
        "layerCount": len(layers),
        "layers": layers[:200],
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
