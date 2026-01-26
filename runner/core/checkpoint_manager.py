"""
CheckpointManager - Handles saving and loading model checkpoints.
"""

from pathlib import Path
from typing import Dict, Any, Optional, List
from collections import OrderedDict

import torch
import torch.nn as nn


class CheckpointManager:
    """Manages model checkpoint saving and loading."""

    def __init__(self, experiment_id: int, project_root: Path):
        self.experiment_id = experiment_id
        self.project_root = project_root
        self.checkpoint_dir = project_root / "checkpoints-data" / f"exp_{experiment_id}"
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    def save_checkpoint(
        self,
        round_num: int,
        model_state: Dict[str, Any],
        metrics: Dict[str, float],
        additional_data: Optional[Dict[str, Any]] = None
    ) -> Path:
        """
        Save a model checkpoint.

        Args:
            round_num: Current round number
            model_state: Model state dict
            metrics: Metrics at this checkpoint
            additional_data: Any additional data to save

        Returns:
            Path to saved checkpoint
        """
        checkpoint_path = self.checkpoint_dir / f"round_{round_num}.pt"

        checkpoint = {
            'round': round_num,
            'model_state_dict': model_state,
            'metrics': metrics,
        }

        if additional_data:
            checkpoint.update(additional_data)

        torch.save(checkpoint, checkpoint_path)
        print(f"[CheckpointManager] Saved checkpoint: {checkpoint_path.name}")

        return checkpoint_path

    def load_checkpoint(self, round_num: int) -> Optional[Dict[str, Any]]:
        """
        Load a checkpoint from a specific round.

        Args:
            round_num: Round number to load

        Returns:
            Checkpoint data or None if not found
        """
        checkpoint_path = self.checkpoint_dir / f"round_{round_num}.pt"

        if not checkpoint_path.exists():
            print(f"[CheckpointManager] Checkpoint not found: {checkpoint_path}")
            return None

        checkpoint = torch.load(checkpoint_path, map_location='cpu')
        print(f"[CheckpointManager] Loaded checkpoint: {checkpoint_path.name}")

        return checkpoint

    def load_latest_checkpoint(self) -> Optional[Dict[str, Any]]:
        """
        Load the latest checkpoint.

        Returns:
            Latest checkpoint data or None if no checkpoints exist
        """
        checkpoints = list(self.checkpoint_dir.glob("round_*.pt"))

        if not checkpoints:
            return None

        # Sort by round number
        checkpoints.sort(key=lambda p: int(p.stem.split('_')[1]))
        latest = checkpoints[-1]

        return torch.load(latest, map_location='cpu')

    def get_relative_path(self, checkpoint_path: Path) -> str:
        """Get path relative to project root for database storage."""
        return str(checkpoint_path.relative_to(self.project_root))

    def list_checkpoints(self) -> List[Path]:
        """List all checkpoints for this experiment."""
        checkpoints = list(self.checkpoint_dir.glob("round_*.pt"))
        checkpoints.sort(key=lambda p: int(p.stem.split('_')[1]))
        return checkpoints

    @staticmethod
    def get_model_parameters(model: nn.Module) -> List[Any]:
        """Extract parameters from a PyTorch model as numpy arrays."""
        return [val.cpu().numpy() for _, val in model.state_dict().items()]

    @staticmethod
    def set_model_parameters(model: nn.Module, parameters: List[Any]) -> None:
        """Set model parameters from numpy arrays."""
        params_dict = zip(model.state_dict().keys(), parameters)
        state_dict = OrderedDict({k: torch.tensor(v) for k, v in params_dict})
        model.load_state_dict(state_dict, strict=True)

    @staticmethod
    def parameters_to_state_dict(model: nn.Module, parameters: List[Any]) -> Dict[str, Any]:
        """Convert parameter list to state dict format."""
        keys = list(model.state_dict().keys())
        return {k: torch.tensor(v) for k, v in zip(keys, parameters)}
