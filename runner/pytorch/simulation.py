"""
SimulationOrchestrator - Main orchestrator for running Flower simulations.
"""

import sys
import io
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List, Tuple

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

import flwr as fl
from flwr.common import ndarrays_to_parameters
from flwr.server.strategy import Strategy

from ..core.experiment import ExperimentManager
from ..core.module_loader import ModuleLoader
from ..core.checkpoint_manager import CheckpointManager
from .client import FlowerClient, create_client_fn
from .server import create_strategy
from .defaults.model import get_model as get_default_model
from .defaults.dataset import load_data as load_default_data
from .defaults.config import DEFAULT_CONFIG


class LogCapture:
    """Captures stdout and stderr without printing to terminal (silent mode)."""

    def __init__(self):
        self.logs = io.StringIO()
        self._stdout = sys.stdout
        self._stderr = sys.stderr

    def __enter__(self):
        sys.stdout = self
        sys.stderr = self
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout = self._stdout
        sys.stderr = self._stderr

    def write(self, text):
        # Capture to logs for storage, but don't print to terminal
        self.logs.write(text)

    def flush(self):
        pass  # No-op since we're not printing

    def fileno(self):
        """Return the file descriptor of the underlying stdout.
        Required by Ray/faulthandler."""
        return self._stdout.fileno()

    def isatty(self):
        """Return whether the underlying stdout is a tty."""
        return self._stdout.isatty()

    def get_logs(self) -> str:
        return self.logs.getvalue()


class SimulationOrchestrator:
    """
    Orchestrates Flower federated learning simulations.

    Handles loading of user modules, creation of clients and server,
    running the simulation, and collecting metrics.
    """

    def __init__(self, experiment_id: int, project_root: Path):
        """
        Initialize the orchestrator.

        Args:
            experiment_id: ID of the experiment in the database
            project_root: Path to the project root directory
        """
        self.experiment_id = experiment_id
        self.project_root = project_root

        # Initialize managers
        self.experiment_manager = ExperimentManager(experiment_id, project_root)
        self.module_loader = ModuleLoader(project_root)
        self.checkpoint_manager = CheckpointManager(experiment_id, project_root)

        # Will be populated after loading config
        self.config: Dict[str, Any] = {}
        self.model_fn: Optional[Callable[[], nn.Module]] = None
        self.load_data_fn: Optional[Callable] = None
        self.strategy_fn: Optional[Callable[[], Strategy]] = None
        self.device: torch.device = torch.device("cpu")

        # Metrics storage
        self.round_metrics: List[Dict[str, Any]] = []

        # Log capture
        self.log_capture: Optional[LogCapture] = None

    def run(self):
        """Execute the complete simulation workflow."""
        # Start capturing logs (silent mode - saves to DB, no terminal output)
        self.log_capture = LogCapture()

        try:
            with self.log_capture:
                # 1. Connect to database and load config
                self.experiment_manager.connect()
                self.config = self.experiment_manager.load_config()
                self.experiment_manager.update_status("running")

                # 2. Load modules (user-provided or defaults)
                self._load_modules()

                # 3. Setup device
                self._setup_device()

                # 4. Run simulation
                self._run_simulation()

                # 5. Save final results
                self._save_final_results()

                # 6. Mark as completed
                self.experiment_manager.update_status("completed")
                print("[Orchestrator] Experiment completed successfully!")

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"[Orchestrator] Experiment failed: {error_msg}")
            self.experiment_manager.update_status("failed", error_msg)
            raise

        finally:
            # Save logs before closing connection
            if self.log_capture:
                try:
                    logs = self.log_capture.get_logs()
                    if logs:
                        self.experiment_manager.save_logs(logs)
                except Exception as e:
                    print(f"[Orchestrator] Warning: Failed to save logs: {e}")

            self.experiment_manager.close()

    def _load_modules(self):
        """Load user modules or fall back to defaults."""
        print("\n[Orchestrator] Loading modules...")

        # Load model
        model_path = self.config.get('model_path')
        if model_path and model_path.endswith('.py'):
            model_module = self.module_loader.load_module(model_path, 'user_model')
            if model_module is None:
                raise RuntimeError("Failed to load model module. Please check your file and upload again.")
            self.model_fn = self.module_loader.extract_model(model_module)
            if self.model_fn is None:
                raise RuntimeError("No valid model found. Expected get_model() function or Net/Model class. Please check your file and upload again.")

        if self.model_fn is None:
            print("[Orchestrator] Using default CIFAR-10 CNN model")
            self.model_fn = get_default_model

        # Load dataset
        dataset_path = self.config.get('dataset_path')
        if dataset_path:
            dataset_module = self.module_loader.load_module(dataset_path, 'user_dataset')
            if dataset_module is None:
                raise RuntimeError("Failed to load dataset module. Please check your file and upload again.")
            self.load_data_fn = self.module_loader.extract_dataset_loader(dataset_module)
            if self.load_data_fn is None:
                raise RuntimeError("No valid dataset loader found. Expected load_data() function. Please check your file and upload again.")

        if self.load_data_fn is None:
            print("[Orchestrator] Using default CIFAR-10 dataset")
            self.load_data_fn = load_default_data

        # Load strategy/algorithm
        algorithm_path = self.config.get('algorithm_path')
        if algorithm_path:
            algorithm_module = self.module_loader.load_module(algorithm_path, 'user_algorithm')
            if algorithm_module is None:
                raise RuntimeError("Failed to load algorithm module. Please check your file and upload again.")
            self.strategy_fn = self.module_loader.extract_strategy(algorithm_module)
            if self.strategy_fn is None:
                raise RuntimeError("No valid strategy found. Expected get_strategy() function. Please check your file and upload again.")

        # Load additional config
        config_path = self.config.get('config_path')
        if config_path:
            user_config = self.module_loader.extract_config(config_path)
            # Merge user config with defaults
            merged = {**DEFAULT_CONFIG, **user_config}
            self.config['custom_config'] = merged

    def _setup_device(self):
        """Setup compute device (CPU/GPU)."""
        use_gpu = self.config.get('use_gpu', False)

        if use_gpu and torch.cuda.is_available():
            self.device = torch.device("cuda")
            print(f"[Orchestrator] Using GPU: {torch.cuda.get_device_name(0)}")
        elif use_gpu and torch.backends.mps.is_available():
            self.device = torch.device("mps")
            print("[Orchestrator] Using MPS (Apple Silicon)")
        else:
            self.device = torch.device("cpu")
            print("[Orchestrator] Using CPU")

    def _run_simulation(self):
        """Run the Flower simulation."""
        num_clients = self.config['num_clients']
        num_rounds = self.config['num_rounds']
        client_fraction = self.config['client_fraction']
        local_epochs = self.config.get('local_epochs', 1)
        learning_rate = self.config.get('learning_rate', 0.01)

        print(f"\n{'='*60}")
        print(f"Starting Flower Simulation")
        print(f"{'='*60}")
        print(f"Experiment ID: {self.experiment_id}")
        print(f"Framework: {self.config['framework']}")
        print(f"Clients: {num_clients}")
        print(f"Rounds: {num_rounds}")
        print(f"Client Fraction: {client_fraction*100:.0f}%")
        print(f"Local Epochs: {local_epochs}")
        print(f"Learning Rate: {learning_rate}")
        print(f"Device: {self.device}")
        print(f"{'='*60}\n")

        # Create client function
        client_fn = create_client_fn(
            model_fn=self.model_fn,
            load_data_fn=self.load_data_fn,
            num_clients=num_clients,
            device=self.device,
            local_epochs=local_epochs,
            learning_rate=learning_rate,
        )

        # Create fit/evaluate config functions
        def on_fit_config_fn(server_round: int) -> Dict[str, Any]:
            return {
                "server_round": server_round,
                "local_epochs": local_epochs,
                "learning_rate": learning_rate,
            }

        def on_evaluate_config_fn(server_round: int) -> Dict[str, Any]:
            return {"server_round": server_round}

        # Create strategy
        strategy = create_strategy(
            num_clients=num_clients,
            client_fraction=client_fraction,
            strategy_fn=self.strategy_fn,
            on_fit_config_fn=on_fit_config_fn,
            on_evaluate_config_fn=on_evaluate_config_fn,
        )

        # Wrap strategy to capture metrics
        strategy = self._wrap_strategy_with_callbacks(strategy)

        # Get initial parameters from a model instance
        initial_model = self.model_fn()
        initial_parameters = ndarrays_to_parameters(
            [val.cpu().numpy() for _, val in initial_model.state_dict().items()]
        )

        # Configure resources from experiment config (or use defaults)
        cpus_per_client = self.config.get('cpus_per_client', 1)
        gpu_fraction = self.config.get('gpu_fraction_per_client', 0.1)

        client_resources = {"num_cpus": cpus_per_client}
        if self.device.type == "cuda":
            client_resources["num_gpus"] = gpu_fraction

        # Log resource configuration
        print(f"\n[Orchestrator] Resource Configuration:")
        print(f"  Device: {self.device.type.upper()}")
        print(f"  CPUs per client: {cpus_per_client}")
        if self.device.type == "cuda":
            print(f"  GPU fraction per client: {gpu_fraction} ({int(1/gpu_fraction)} clients per GPU)")

        # Run simulation
        # Configure Ray to reduce noise (logs are captured and saved anyway)
        ray_init_args = {
            "include_dashboard": False,  # Disable dashboard to reduce overhead
            "configure_logging": True,
            "logging_level": "error",  # Only show errors, not warnings/info
            "log_to_driver": False,  # Suppress actor output from appearing in terminal
            "object_store_memory": 100 * 1024 * 1024,  # 100MB - prevent Ray from claiming 30% of system RAM
        }

        history = fl.simulation.start_simulation(
            client_fn=client_fn,
            num_clients=num_clients,
            config=fl.server.ServerConfig(num_rounds=num_rounds),
            strategy=strategy,
            client_resources=client_resources,
            ray_init_args=ray_init_args,
            actor_kwargs={"max_restarts": 0},
        )

        # Process history
        self._process_history(history)

    def _wrap_strategy_with_callbacks(self, strategy: Strategy) -> Strategy:
        """
        Wrap strategy to add callbacks for metrics collection and checkpointing.

        This uses a wrapper class that intercepts aggregate_fit and aggregate_evaluate
        to save metrics and checkpoints after each round.
        """
        orchestrator = self

        class StrategyWrapper(type(strategy)):
            """Wrapper that adds callbacks to the base strategy."""

            def __init__(self, base_strategy):
                # Copy all attributes from the base strategy
                self.__dict__.update(base_strategy.__dict__)
                self._base = base_strategy
                self._current_round = 0

            def aggregate_fit(self, server_round, results, failures):
                # Call base implementation
                aggregated = self._base.aggregate_fit(server_round, results, failures)
                self._current_round = server_round

                if aggregated is not None:
                    parameters, metrics = aggregated

                    # Save checkpoint
                    if parameters is not None:
                        # Convert parameters to model state dict
                        model = orchestrator.model_fn()
                        params_list = fl.common.parameters_to_ndarrays(parameters)

                        checkpoint_path = orchestrator.checkpoint_manager.save_checkpoint(
                            round_num=server_round,
                            model_state=CheckpointManager.parameters_to_state_dict(model, params_list),
                            metrics=dict(metrics) if metrics else {},
                        )

                        # Record in database
                        rel_path = orchestrator.checkpoint_manager.get_relative_path(checkpoint_path)
                        orchestrator.experiment_manager.record_checkpoint(
                            round_num=server_round,
                            file_path=rel_path,
                            accuracy=metrics.get("train_accuracy") if metrics else None,
                            loss=metrics.get("train_loss") if metrics else None,
                        )

                    # Store train metrics for combining with eval metrics later
                    if metrics:
                        self._last_fit_metrics = {
                            "train_loss": metrics.get("train_loss"),
                            "train_accuracy": metrics.get("train_accuracy"),
                        }

                    print(f"\n[Round {server_round}] Fit completed")
                    if metrics:
                        for k, v in metrics.items():
                            print(f"  {k}: {v:.4f}")

                return aggregated

            def aggregate_evaluate(self, server_round, results, failures):
                # Call base implementation
                aggregated = self._base.aggregate_evaluate(server_round, results, failures)

                if aggregated is not None:
                    loss, metrics = aggregated

                    # Combine fit and eval metrics for this round
                    round_metrics = {
                        "eval_loss": float(loss) if loss else None,
                        "eval_accuracy": metrics.get("eval_accuracy") if metrics else None,
                    }

                    # Get train metrics from the last fit if available
                    if hasattr(self, '_last_fit_metrics'):
                        round_metrics.update(self._last_fit_metrics)

                    # Save to database
                    orchestrator.experiment_manager.save_round_metrics(
                        round_num=server_round,
                        metrics=round_metrics,
                    )

                    orchestrator.round_metrics.append(round_metrics)

                    print(f"[Round {server_round}] Evaluate completed")
                    print(f"  eval_loss: {loss:.4f}" if loss else "  eval_loss: N/A")
                    if metrics:
                        for k, v in metrics.items():
                            print(f"  {k}: {v:.4f}")
                    print()

                return aggregated

        # We need to import CheckpointManager here to use static method
        from ..core.checkpoint_manager import CheckpointManager

        return StrategyWrapper(strategy)

    def _process_history(self, history):
        """Process simulation history and extract final metrics."""
        self.history = history

        # Extract metrics from history
        if history.metrics_distributed:
            print("\n[Orchestrator] Distributed metrics:")
            for key, values in history.metrics_distributed.items():
                if values:
                    print(f"  {key}: {values[-1][1]:.4f} (final)")

        if history.losses_distributed:
            print("[Orchestrator] Distributed losses:")
            for round_num, loss in history.losses_distributed:
                print(f"  Round {round_num}: {loss:.4f}")

    def _save_final_results(self):
        """Save final experiment results."""
        # Get final metrics
        final_accuracy = None
        final_loss = None

        # Try to get from history
        if hasattr(self, 'history'):
            if self.history.metrics_distributed:
                for key, values in self.history.metrics_distributed.items():
                    if 'accuracy' in key.lower() and values:
                        final_accuracy = values[-1][1]
                        break

            if self.history.losses_distributed:
                final_loss = self.history.losses_distributed[-1][1]

        # Fallback to round metrics
        if self.round_metrics:
            last_round = self.round_metrics[-1]
            if final_accuracy is None:
                final_accuracy = last_round.get('eval_accuracy')
            if final_loss is None:
                final_loss = last_round.get('eval_loss')

        # Save to database
        if final_accuracy is not None or final_loss is not None:
            self.experiment_manager.save_final_results(
                accuracy=final_accuracy or 0.0,
                loss=final_loss or 0.0,
            )

        print(f"\n{'='*60}")
        print("Experiment Completed!")
        print(f"Final Accuracy: {final_accuracy:.4f}" if final_accuracy else "Final Accuracy: N/A")
        print(f"Final Loss: {final_loss:.4f}" if final_loss else "Final Loss: N/A")
        print(f"{'='*60}")
