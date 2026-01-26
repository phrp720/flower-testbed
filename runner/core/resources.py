"""
Resource detection utility for the Flower testbed.
Detects available CPU and GPU resources on the system.
"""

import os
import json
import sys


def get_cpu_count() -> int:
    """Get the number of available CPU cores."""
    return os.cpu_count() or 1


def get_gpu_info() -> dict:
    """
    Get GPU information if available.
    Returns dict with 'available', 'count', and 'devices' list.
    """
    result = {
        "available": False,
        "count": 0,
        "devices": [],
        "backend": None,
    }

    # Try CUDA (NVIDIA GPUs)
    try:
        import torch
        if torch.cuda.is_available():
            result["available"] = True
            result["count"] = torch.cuda.device_count()
            result["backend"] = "cuda"
            for i in range(result["count"]):
                props = torch.cuda.get_device_properties(i)
                result["devices"].append({
                    "id": i,
                    "name": props.name,
                    "memory_gb": round(props.total_memory / (1024**3), 2),
                })
            return result
    except ImportError:
        pass

    # Try MPS (Apple Silicon)
    try:
        import torch
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            result["available"] = True
            result["count"] = 1  # MPS is a single unified GPU
            result["backend"] = "mps"
            result["devices"].append({
                "id": 0,
                "name": "Apple Silicon GPU",
                "memory_gb": None,  # MPS shares system memory
            })
            return result
    except ImportError:
        pass

    return result


def get_system_resources() -> dict:
    """Get all available system resources."""
    return {
        "cpu": {
            "count": get_cpu_count(),
        },
        "gpu": get_gpu_info(),
    }


if __name__ == "__main__":
    # When run directly, output JSON for the API to consume
    resources = get_system_resources()
    print(json.dumps(resources))