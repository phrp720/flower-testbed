"""
SimulationOrchestrator - Main orchestrator for running Flower simulations.
"""

import sys
import io
import os
import json
import time
import traceback
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List

import torch
import torch.nn as nn

import flwr as fl
from flwr.clientapp import ClientApp
from flwr.server import ServerApp, ServerAppComponents
from flwr.server.strategy import Strategy

from ..core.experiment import ExperimentManager
from ..core.module_loader import ModuleLoader
from ..core.checkpoint_manager import CheckpointManager
from .client import create_client_fn
from .server import create_strategy
from .defaults.dataset import build_partitioner
from ..core.resolved_setup import resolve as resolve_setup
from .defaults.model import get_model as get_default_model
from .defaults.dataset import load_data as load_default_data
from .defaults.toy2d import get_model as get_toy2d_model, load_data as load_toy2d_data
from .defaults.config import DEFAULT_CONFIG


class LogCapture:
    """
    Captures stdout and stderr without printing to terminal (silent mode).

    Logs are flushed to the database periodically rather than only at the end.
    Holding them until the run finishes means anyone watching a live experiment
    -- a user, or the agent diagnosing a slow run -- sees nothing at all until
    it is over, which is exactly when the logs stop being useful.
    """

    # Flush at most this often, and only when there is something new. Writing the
    # whole blob is cheap next to a training round.
    FLUSH_INTERVAL_SECONDS = 10

    def __init__(self, on_flush=None):
        self.logs = io.StringIO()
        self._stdout = sys.stdout
        self._stderr = sys.stderr
        self._on_flush = on_flush
        self._last_flush = time.monotonic()
        self._last_flushed_length = 0
        self._flushing = False

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

        # Flush only on a completed line, and never from inside a flush.
        #
        # print() emits its text and its newline as two separate write() calls,
        # and save_logs() prints a line of its own. Flushing on the first of
        # those two calls therefore spliced that line into the middle of the one
        # being written, producing runs like
        #   [CheckpointManager] Saved checkpoint: round_3.pt[ExperimentManager] ...
        if self._flushing or not text.endswith("\n"):
            return

        self._maybe_flush()

    def _maybe_flush(self):
        """Persist the captured logs if enough time has passed."""
        if self._on_flush is None:
            return

        now = time.monotonic()
        if now - self._last_flush < self.FLUSH_INTERVAL_SECONDS:
            return

        current = self.logs.getvalue()
        if len(current) == self._last_flushed_length:
            self._last_flush = now
            return

        self._last_flush = now
        self._last_flushed_length = len(current)

        self._flushing = True
        try:
            self._on_flush(current)
        except Exception:
            # A failed log write must never interrupt training. The final write
            # in the run's `finally` block is the backstop.
            pass
        finally:
            self._flushing = False

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

    def __init__(self, experiment_id: str, project_root: Path):
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
        self.module_loader = ModuleLoader(project_root, experiment_id=experiment_id)
        self.checkpoint_manager = CheckpointManager(experiment_id, project_root)

        # Will be populated after loading config
        self.config: Dict[str, Any] = {}
        self.model_fn: Optional[Callable[[], nn.Module]] = None
        # Persisting every client's local model multiplies disk use by the client
        # count, so it is opt-in through customConfig.save_client_checkpoints.
        self.save_client_checkpoints = False
        self.load_data_fn: Optional[Callable] = None
        self.strategy_fn: Optional[Callable[[], Strategy]] = None
        self.device: torch.device = torch.device("cpu")

        # Metrics storage
        self.round_metrics: List[Dict[str, Any]] = []
        self.latest_fit_metrics: Dict[str, Any] = {}

        # Log capture
        self.log_capture: Optional[LogCapture] = None

    def run(self):
        """Execute the complete simulation workflow."""
        # Start capturing logs (silent mode - saves to DB, no terminal output)
        self.log_capture = LogCapture(on_flush=self._flush_logs)
        failure: Optional[str] = None

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

            # Held for the finally block to append.
            #
            # This except runs *after* the LogCapture context has exited, so
            # anything printed here goes to the real stdout and never reaches
            # the saved logs. A failed run therefore ended with the start-up
            # banner and no indication of what went wrong -- the reason lived
            # only in the error_message column. The traceback is the useful
            # part: the message names what broke, the traceback names where.
            failure = "".join(traceback.format_exception(type(e), e, e.__traceback__))
            raise

        finally:
            # Save logs before closing connection
            if self.log_capture:
                try:
                    logs = self.log_capture.get_logs()
                    if failure:
                        logs = (
                            f"{logs}\n"
                            f"{'=' * 60}\n"
                            f"Experiment failed\n"
                            f"{'=' * 60}\n"
                            f"{failure}"
                        )
                    if logs:
                        self.experiment_manager.save_logs(logs)
                except Exception as e:
                    print(f"[Orchestrator] Warning: Failed to save logs: {e}")

            # Drop this experiment's module cache; nothing else refers to it.
            self.module_loader.cleanup()

            self.experiment_manager.close()

    def _flush_logs(self, logs: str) -> None:
        """Persist partial logs mid-run so a live experiment is observable."""
        try:
            self.experiment_manager.save_logs(logs)
        except Exception:
            pass

    def _is_toy2d(self) -> bool:
        """Whether this experiment uses the drawable 2D dataset."""
        custom_config = self.config.get('custom_config') or {}
        dataset_config = custom_config.get('dataset')
        return isinstance(dataset_config, dict) and bool(dataset_config.get('kind'))

    def _load_modules(self):
        """Load user modules or fall back to defaults."""
        print("\n[Orchestrator] Loading modules...")

        # Set before any loader runs: the toy dataset reads its shape from here.
        custom_config = self.config.get('custom_config') or {}
        if self._is_toy2d():
            os.environ['FLOWER_TOY2D'] = json.dumps(custom_config['dataset'])
        if custom_config.get('partitioner'):
            os.environ['FLOWER_PARTITIONER'] = json.dumps(custom_config['partitioner'])

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
            if self._is_toy2d():
                print("[Orchestrator] Using 2D playground network")
                self.model_fn = get_toy2d_model
            else:
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
            if self._is_toy2d():
                print("[Orchestrator] Using 2D playground dataset")
                self.load_data_fn = load_toy2d_data
            else:
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

    def _record_resolved_setup(self, strategy):
        """Describe the run on its own row; never fatal if it cannot."""
        try:
            custom_config = self.config.get('custom_config') or {}
            partitioner = None
            if not self.config.get('dataset_path'):
                # Same call the default loader makes, so the class recorded is
                # the class that will be used.
                partitioner = build_partitioner(
                    self.config.get('num_clients', 1),
                    custom_config.get('partitioner'),
                )

            setup = resolve_setup(
                strategy=strategy,
                strategy_name=(custom_config.get('strategy') or {}).get('name'),
                algorithm_path=self.config.get('algorithm_path'),
                dataset_path=self.config.get('dataset_path'),
                model=self.model_fn() if self.model_fn else None,
                partitioner=partitioner,
                dataset_id='toy2d' if self._is_toy2d() else 'cifar10',
            )
            self.experiment_manager.save_resolved_setup(setup)
        except Exception as error:
            print(f"[Orchestrator] Could not resolve setup: {error}")

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

        custom_config = self.config.get('custom_config') or {}

        # Partitioning config reaches the default dataset loader through the
        # environment, because load_data's signature is a fixed contract that
        # every uploaded dataset module implements and so cannot grow a argument.
        # Set before Ray starts, so worker processes inherit it.
        self.save_client_checkpoints = bool(custom_config.get('save_client_checkpoints'))
        if self.save_client_checkpoints:
            print("[Orchestrator] Saving per-client model checkpoints")

        # A 2D dataset config swaps in the toy dataset and its matching network.
        # Nothing else about the run changes -- same strategies, same partitioner,
        # same simulation -- but the input becomes drawable.
        dataset_config = custom_config.get('dataset')
        if isinstance(dataset_config, dict) and dataset_config.get('kind'):
            os.environ['FLOWER_TOY2D'] = json.dumps(dataset_config)
            print(f"[Orchestrator] 2D dataset: {dataset_config}")
        else:
            os.environ.pop('FLOWER_TOY2D', None)

        partitioner_config = custom_config.get('partitioner')
        if partitioner_config:
            os.environ['FLOWER_PARTITIONER'] = json.dumps(partitioner_config)
            print(f"[Orchestrator] Partitioner: {partitioner_config}")
        else:
            os.environ.pop('FLOWER_PARTITIONER', None)

        # Per-node hyperparameter overrides, keyed by partition id. Lets a single
        # experiment give different clients different local training settings.
        client_overrides = custom_config.get('client_overrides') or {}
        if client_overrides:
            print(f"[Orchestrator] Per-client overrides for partitions: "
                  f"{', '.join(str(k) for k in client_overrides)}")

        # Create client function
        client_fn = create_client_fn(
            model_fn=self.model_fn,
            load_data_fn=self.load_data_fn,
            num_clients=num_clients,
            device=self.device,
            local_epochs=local_epochs,
            learning_rate=learning_rate,
            client_overrides=client_overrides,
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

        # Built-in strategy selection, so aggregation can be changed without
        # uploading a Python file.
        strategy_spec = custom_config.get('strategy')
        strategy_name = None
        strategy_params = None
        if isinstance(strategy_spec, str):
            strategy_name = strategy_spec
        elif isinstance(strategy_spec, dict):
            strategy_name = strategy_spec.get('name')
            strategy_params = strategy_spec.get('params')

        # The FedOpt family keeps server-side optimiser state and needs somewhere
        # to start. Building it costs one model instantiation.
        initial_parameters = None
        if strategy_name and strategy_name.lower() in ('fedadam', 'fedadagrad', 'fedyogi'):
            initial_parameters = fl.common.ndarrays_to_parameters(
                CheckpointManager.get_model_parameters(self.model_fn())
            )

        # Create strategy
        strategy = create_strategy(
            num_clients=num_clients,
            client_fraction=client_fraction,
            strategy_fn=self.strategy_fn,
            on_fit_config_fn=on_fit_config_fn,
            on_evaluate_config_fn=on_evaluate_config_fn,
            strategy_name=strategy_name,
            strategy_params=strategy_params,
            initial_parameters=initial_parameters,
        )

        # Record what this run is actually made of, before wrapping obscures the
        # class name. create_strategy falls back to FedAvg when an uploaded
        # module raises, so this is the only place the difference between asked
        # for and got is still visible.
        self._record_resolved_setup(strategy)

        # Wrap strategy to capture metrics
        strategy = self._wrap_strategy_with_callbacks(strategy)

        # Configure resources from experiment config (or use defaults)
        cpus_per_client = self.config.get('cpus_per_client', 1)
        gpu_fraction = self.config.get('gpu_fraction_per_client', 0.1)
        ray_num_cpus = self._get_ray_num_cpus(cpus_per_client, num_clients)

        client_resources = {"num_cpus": cpus_per_client}
        if self.device.type == "cuda":
            client_resources["num_gpus"] = gpu_fraction

        # Log resource configuration
        print(f"\n[Orchestrator] Resource Configuration:")
        print(f"  Device: {self.device.type.upper()}")
        print(f"  CPUs per client: {cpus_per_client}")
        print(f"  Ray num_cpus: {ray_num_cpus}")
        if self.device.type == "cuda":
            print(f"  GPU fraction per client: {gpu_fraction} ({int(1/gpu_fraction)} clients per GPU)")

        server_app = ServerApp(
            server_fn=lambda context: ServerAppComponents(
                strategy=strategy,
                config=fl.server.ServerConfig(num_rounds=num_rounds),
            )
        )
        client_app = ClientApp(client_fn=client_fn)

        # Configure Ray backend to reduce noise (logs are captured and saved anyway)
        backend_config = {
            "init_args": {
                "include_dashboard": False,  # Disable dashboard to reduce overhead
                "configure_logging": True,
                "logging_level": "error",  # Only show errors, not warnings/info
                "log_to_driver": False,  # Suppress actor output from appearing in terminal
                "num_cpus": ray_num_cpus,
            },
            "client_resources": client_resources,
            "actor": {
                "max_restarts": 0,
            },
        }

        fl.simulation.run_simulation(
            server_app=server_app,
            client_app=client_app,
            num_supernodes=num_clients,
            backend_name="ray",
            backend_config=backend_config,
            verbose_logging=False,
        )

    def _get_ray_num_cpus(self, cpus_per_client: int, num_clients: int) -> int:
        """Cap Ray CPU discovery so a single container does not overcommit the host."""
        configured = os.environ.get("RAY_NUM_CPUS")
        if configured:
            try:
                value = int(configured)
                if value > 0:
                    return value
            except ValueError:
                pass

        available_cpus = os.cpu_count() or 1
        requested_cpus = max(1, cpus_per_client * max(1, num_clients))
        return max(1, min(available_cpus, requested_cpus, 8))

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

            @staticmethod
            def _parameter_bytes(parameters) -> int:
                """
                The size of a parameter payload as Flower actually serialised it.

                Parameters.tensors is the exact byte string the transport carries,
                so this is a measurement rather than an estimate. The checkpoint
                file on disk is not a substitute: it adds a pickle envelope and
                the stored metrics, which inflate a small model by an order of
                magnitude and would never cross a network.
                """
                tensors = getattr(parameters, "tensors", None) or []
                return sum(len(tensor) for tensor in tensors)

            def configure_fit(self, server_round, parameters, client_manager):
                instructions = self._base.configure_fit(server_round, parameters, client_manager)
                # What the server sends each selected client to train from.
                self._fit_downlink = {
                    getattr(proxy, "cid", None): self._parameter_bytes(ins.parameters)
                    for proxy, ins in instructions
                }
                return instructions

            def configure_evaluate(self, server_round, parameters, client_manager):
                instructions = self._base.configure_evaluate(server_round, parameters, client_manager)
                # Evaluation clients are sampled independently of the fit clients,
                # so this is a different cohort and a separate download.
                self._evaluate_downlink = {
                    getattr(proxy, "cid", None): self._parameter_bytes(ins.parameters)
                    for proxy, ins in instructions
                }
                return instructions

            def _client_rows(self, results, phase):
                """
                Per-client metrics, straight off the results the strategy already
                receives.

                The aggregators collapse these into a weighted mean and throw the
                rest away, which is why metrics.client_metrics has always been
                empty. Keeping them is what makes per-node analysis, non-IID
                diagnosis and straggler detection possible.

                Each row also carries the bytes that client actually exchanged
                this round, so communication cost is measured rather than assumed.
                """
                downlink = (
                    getattr(self, "_fit_downlink", None)
                    if phase == "fit"
                    else getattr(self, "_evaluate_downlink", None)
                ) or {}

                rows = []
                for proxy, res in results:
                    cid = getattr(proxy, "cid", None)
                    row = {
                        "cid": cid,
                        "phase": phase,
                        "num_examples": getattr(res, "num_examples", None),
                        # Model parameters received from the server this round.
                        "downlink_bytes": downlink.get(cid),
                        # Model parameters returned. An evaluation reply carries a
                        # loss and a few scalars, never a model, so it is zero.
                        "uplink_bytes": (
                            self._parameter_bytes(getattr(res, "parameters", None))
                            if phase == "fit"
                            else 0
                        ),
                    }
                    if phase == "evaluate" and getattr(res, "loss", None) is not None:
                        row["loss"] = float(res.loss)
                    for key, value in (getattr(res, "metrics", None) or {}).items():
                        if isinstance(value, (int, float)):
                            row[key] = float(value)
                    rows.append(row)
                return rows

            def aggregate_fit(self, server_round, results, failures):
                # Call base implementation
                aggregated = self._base.aggregate_fit(server_round, results, failures)
                self._current_round = server_round

                self._last_fit_clients = self._client_rows(results, "fit")

                # Per-client model checkpoints, off by default: this multiplies
                # checkpoint disk usage by the number of participating clients.
                if orchestrator.save_client_checkpoints:
                    for proxy, res in results:
                        try:
                            model = orchestrator.model_fn()
                            params = fl.common.parameters_to_ndarrays(res.parameters)
                            path = orchestrator.checkpoint_manager.save_checkpoint(
                                round_num=server_round,
                                model_state=CheckpointManager.parameters_to_state_dict(model, params),
                                metrics=dict(getattr(res, "metrics", None) or {}),
                                client_id=getattr(proxy, "cid", None),
                            )
                            orchestrator.experiment_manager.record_checkpoint(
                                round_num=server_round,
                                file_path=orchestrator.checkpoint_manager.get_relative_path(path),
                                accuracy=(getattr(res, "metrics", None) or {}).get("train_accuracy"),
                                loss=(getattr(res, "metrics", None) or {}).get("train_loss"),
                                client_id=getattr(proxy, "cid", None),
                            )
                        except Exception as e:
                            print(f"[Round {server_round}] Could not save client checkpoint: {e}")

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
                        orchestrator.latest_fit_metrics = dict(self._last_fit_metrics)

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

                    # Per-client breakdown for both phases of this round.
                    round_metrics["client_metrics"] = (
                        getattr(self, "_last_fit_clients", []) + self._client_rows(results, "evaluate")
                    )

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

    def _save_final_results(self):
        """Save final experiment results."""
        final_accuracy = None
        final_loss = None

        if self.round_metrics:
            last_round = self.round_metrics[-1]
            final_accuracy = last_round.get('eval_accuracy')
            final_loss = last_round.get('eval_loss')

        if final_accuracy is None:
            final_accuracy = self.latest_fit_metrics.get('train_accuracy')
        if final_loss is None:
            final_loss = self.latest_fit_metrics.get('train_loss')

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
