"""
Work out how a trained model can be shown, then show it.

Nothing here is told what the experiment contains. The tool loads the same model
and dataset the run used, pulls one real batch, and decides from the shape of
that batch and the structure of the model which picture is meaningful:

    input (N, 2)        -> a decision surface: sweep the input plane and colour
                           every point by the prediction, plus what each hidden
                           neuron responds to
    input (N, C, H, W)  -> the first convolution's kernels, drawn as the colour
                           patches they are, plus accuracy broken down by class
    anything else       -> say what was found and why it cannot be drawn

That detection is why an uploaded 2D dataset gets a surface without setting any
flag, and why an image dataset gets filters without one either. Previously this
keyed off customConfig.dataset.kind, which describes the config rather than the
data and was wrong whenever the two disagreed.

Everything reported is measured: the surfaces are real forward passes, the
kernels are the stored weights, the accuracies are counted from real predictions.

    python runner/tools/model_view.py <experiment_id> [--resolution 40]
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("PYTHONWARNINGS", "ignore")

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env.local" if (PROJECT_ROOT / ".env.local").exists() else PROJECT_ROOT / ".env")

# Enough points to show the shape of the data without bloating the payload.
MAX_SCATTER_POINTS = 1200
# Hidden layers wider than this stop being readable as a row of tiles.
MAX_NEURONS_PER_LAYER = 16


def main() -> int:
    parser = argparse.ArgumentParser(description="Decide how to visualise a trained model, and do it")
    parser.add_argument("experiment_id", type=str)
    parser.add_argument("--resolution", type=int, default=40)
    parser.add_argument("--max-samples", type=int, default=2000,
                        help="Cap on test images used for per-class accuracy")
    parser.add_argument("--max-filters", type=int, default=64)
    parser.add_argument("--client", type=str, default=None)
    args = parser.parse_args()

    import numpy as np
    import torch

    from runner.core.experiment import ExperimentManager
    from runner.core.checkpoint_manager import CheckpointManager
    from runner.core.module_loader import ModuleLoader

    manager = ExperimentManager(experiment_id=args.experiment_id, project_root=PROJECT_ROOT)
    manager.connect()

    try:
        config = manager.load_config()
        custom = config.get("custom_config") or {}

        # The runner sets these before loading any module; the loaders read them.
        dataset_config = custom.get("dataset")
        if isinstance(dataset_config, dict) and dataset_config.get("kind"):
            os.environ["FLOWER_TOY2D"] = json.dumps(dataset_config)
        if custom.get("partitioner"):
            os.environ["FLOWER_PARTITIONER"] = json.dumps(custom["partitioner"])

        loader = ModuleLoader(PROJECT_ROOT, experiment_id=args.experiment_id)
        is_toy2d = isinstance(dataset_config, dict) and bool(dataset_config.get("kind"))

        # Model and dataset: whatever this run actually used.
        model_fn = None
        model_path = config.get("model_path")
        if model_path and str(model_path).endswith(".py"):
            module = loader.load_module(model_path, "user_model")
            if module is not None:
                model_fn = loader.extract_model(module)
        if model_fn is None:
            if is_toy2d:
                from runner.pytorch.defaults.toy2d import get_model as model_fn  # noqa: N813
            else:
                from runner.pytorch.defaults.model import get_model as model_fn  # noqa: N813

        load_data_fn = None
        class_names = None
        dataset_path = config.get("dataset_path")
        if dataset_path:
            module = loader.load_module(dataset_path, "user_dataset")
            if module is not None:
                load_data_fn = loader.extract_dataset_loader(module)
                names = getattr(module, "CLASSES", None) or getattr(module, "CLASS_NAMES", None)
                if isinstance(names, (list, tuple)):
                    class_names = [str(name) for name in names]
        if load_data_fn is None:
            if is_toy2d:
                from runner.pytorch.defaults.toy2d import load_data as load_data_fn
            else:
                from runner.pytorch.defaults.dataset import load_data as load_data_fn
                from runner.pytorch.defaults.dataset import get_class_names
                if class_names is None:
                    class_names = get_class_names()

        model = model_fn()
        num_clients = int(config.get("num_clients") or 1)
        total_rounds = int(config.get("num_rounds") or 0)
        checkpoints = CheckpointManager(experiment_id=args.experiment_id, project_root=PROJECT_ROOT)

        def checkpoint_path(round_num: int):
            if args.client:
                safe = str(args.client).replace("/", "_")[:64]
                return checkpoints.checkpoint_dir / f"round_{round_num}" / f"client_{safe}.pt"
            return checkpoints.checkpoint_dir / f"round_{round_num}.pt"

        # ---- Look at the data itself, rather than at what the config claims ----
        try:
            train_first, test_first = load_data_fn(0, num_clients)
        except Exception as exc:
            print(json.dumps({"ok": False, "error": f"Could not load this experiment's data: {exc}"}))
            return 0

        sample_batch = None
        for batch in test_first:
            sample_batch = batch
            break
        if sample_batch is None:
            for batch in train_first:
                sample_batch = batch
                break
        if sample_batch is None:
            print(json.dumps({"ok": False, "error": "This experiment's dataset yielded no data."}))
            return 0

        sample_inputs = sample_batch[0]
        input_shape = list(sample_inputs.shape[1:])

        # The first four-dimensional parameter is the first convolution. Its
        # kernels see raw pixels, which is what makes them drawable; anything
        # deeper operates on features and would not read as an image.
        filter_key = None
        for name, tensor in model.state_dict().items():
            if tensor.dim() == 4:
                filter_key = name
                break

        if sample_inputs.dim() == 2 and sample_inputs.shape[1] == 2:
            view = "surface"
        elif sample_inputs.dim() == 4 and filter_key is not None:
            view = "filters"
        else:
            described = "x".join(str(d) for d in input_shape) or "scalar"
            print(json.dumps({
                "ok": True,
                "view": "none",
                "inputShape": input_shape,
                "reason": (
                    f"Each input is {described}. A decision surface needs two "
                    f"dimensions to sweep, and filters need a convolution over "
                    f"pixels; this model has neither."
                ),
            }))
            return 0

        # ------------------------------ surface ------------------------------
        if view == "surface":
            # The plane to sweep comes from the data's own extent, so an uploaded
            # 2D dataset on any scale is framed correctly rather than assumed to
            # match the built-in one.
            # A share each, rather than first-come-first-served.
            #
            # This used to fill a single 1200-point budget client by client and
            # stop when it was full, so a ten-client run drew only the first six
            # partitions. Under non-IID splitting those six are not a sample of
            # the data, they are a biased corner of it -- and `domain` is derived
            # from the extent of whatever was collected, so the plane being swept
            # was sized to that corner too. Every client contributes its share.
            per_client = max(1, MAX_SCATTER_POINTS // max(1, num_clients))

            points = []
            labels = []
            for partition in range(num_clients):
                try:
                    trainloader, _ = load_data_fn(partition, num_clients)
                except Exception:
                    continue

                taken = 0
                for inputs, targets in trainloader:
                    room = per_client - taken
                    if room <= 0:
                        break
                    points.append(inputs.detach().float()[:room])
                    labels.append(targets.detach().to(torch.int64)[:room])
                    taken += min(room, int(targets.shape[0]))

            if points:
                all_points = torch.cat(points)
                all_labels = torch.cat(labels)
            else:
                all_points = sample_inputs.detach().float()
                all_labels = sample_batch[1].detach().to(torch.int64)

            extent = float(all_points.abs().max().item())
            domain = round(extent * 1.15, 4) if extent > 0 else 1.0

            resolution = max(8, min(96, args.resolution))
            axis = np.linspace(-domain, domain, resolution, dtype=np.float32)
            gx, gy = np.meshgrid(axis, axis)
            grid = torch.from_numpy(np.stack([gx.ravel(), gy.ravel()], axis=1))

            def encode_signed(tensor) -> str:
                """
                Pack values in [-1, 1] into one byte per cell.

                As JSON numbers a whole run is several megabytes, nearly all of
                it digits nobody can see: these values only ever become pixel
                colours, and 1/127 is far finer than the eye resolves.
                """
                clamped = tensor.clamp(-1.0, 1.0).mul(127).round().to(torch.int8)
                return base64.b64encode(clamped.numpy().tobytes()).decode("ascii")

            def hidden_activations(inputs):
                """
                What each hidden unit responds to across the plane.

                A model may publish this itself; most do not, so fall back to
                capturing the output of every leaf module. Either way these are
                real forward-pass values, not a reconstruction.
                """
                published = getattr(model, "activations", None)
                if callable(published):
                    return list(published(inputs)), "model.activations()"

                captured = []
                handles = []

                def record(_module, _inputs, output):
                    if isinstance(output, torch.Tensor) and output.dim() == 2:
                        captured.append(output.detach())

                for child in model.modules():
                    if child is model or list(child.children()):
                        continue
                    handles.append(child.register_forward_hook(record))

                try:
                    model(inputs)
                finally:
                    for handle in handles:
                        handle.remove()

                # The last 2-D output is the logits, which the output panel
                # already shows; everything before it is hidden.
                return captured[:-1], "forward hooks on each layer"

            def weight_matrices():
                """Every 2-D weight, in order, for the links between tiles."""
                matrices = []
                for _, parameter in model.named_parameters():
                    if parameter.dim() == 2:
                        matrices.append(parameter.detach().round(decimals=3).tolist())
                return [{"layer": index, "matrix": matrix} for index, matrix in enumerate(matrices)]

            activation_source = None
            frames = []

            for round_num in range(1, total_rounds + 1):
                path = checkpoint_path(round_num)
                if not path.exists():
                    continue

                state = torch.load(path, map_location="cpu", weights_only=False)["model_state_dict"]
                model.load_state_dict(state)
                model.eval()

                with torch.no_grad():
                    hidden, activation_source = hidden_activations(grid)
                    logits = model(grid)
                    # Signed confidence in [-1, 1]: the gap between the two class
                    # probabilities, which is what the blue/orange encodes.
                    probabilities = torch.softmax(logits, dim=1)
                    if probabilities.shape[1] >= 2:
                        output = probabilities[:, 1] - probabilities[:, 0]
                    else:
                        output = probabilities[:, 0] * 2 - 1
                    output = output.reshape(resolution, resolution)

                layers = [
                    {
                        "layer": index,
                        # Both counts travel with the frame. Only the first
                        # MAX_NEURONS_PER_LAYER are encoded -- a wide layer would
                        # otherwise cost megabytes of base64 for rows nobody can
                        # read -- but a viewer that is shown sixteen squares for a
                        # layer of thirty-two has to be told so, or it silently
                        # reports the wrong architecture.
                        "width": int(activation.shape[1]),
                        "neurons": [
                            encode_signed(activation[:, n].reshape(resolution, resolution))
                            for n in range(min(activation.shape[1], MAX_NEURONS_PER_LAYER))
                        ],
                    }
                    for index, activation in enumerate(hidden)
                ]

                frames.append({
                    "round": round_num,
                    "output": encode_signed(output),
                    "layers": layers,
                    "weights": weight_matrices(),
                })

            if not frames:
                print(json.dumps({"ok": False, "error": "No checkpoints found for this experiment."}))
                return 0

            print(json.dumps({
                "ok": True,
                "view": "surface",
                "encoding": "int8-base64",
                "inputShape": input_shape,
                "clientId": args.client,
                "domain": domain,
                "resolution": resolution,
                "activationSource": activation_source,
                # The real architecture, not what fits on screen.
                "hiddenSizes": [layer["width"] for layer in frames[0]["layers"]],
                "drawnSizes": [len(layer["neurons"]) for layer in frames[0]["layers"]],
                "points": all_points.round(decimals=3).tolist(),
                "labels": all_labels.tolist(),
                "datasetKind": (dataset_config or {}).get("kind") if isinstance(dataset_config, dict) else None,
                "frames": frames,
            }))
            return 0

        # ------------------------------ filters ------------------------------
        # Pooled test data: every client's own test split, which is the data the
        # reported eval accuracy was measured on. A separate centralized split
        # would produce a number that disagrees with the run's own.
        #
        # A share each, for the same reason the scatter takes one: a single
        # budget filled client by client stops partway down the client list, and
        # the per-class accuracy it reports is then measured on a corner of the
        # federation rather than on it. Non-IID splitting is exactly the setting
        # where that corner has the wrong class balance, which is exactly when
        # someone is reading the per-class numbers.
        per_client = max(1, args.max_samples // max(1, num_clients))

        batches = []
        for partition in range(num_clients):
            try:
                _, testloader = load_data_fn(partition, num_clients)
            except Exception:
                continue

            taken = 0
            for inputs, targets in testloader:
                room = per_client - taken
                if room <= 0:
                    break
                batches.append((inputs[:room], targets[:room]))
                taken += min(room, int(targets.shape[0]))

        if not batches:
            print(json.dumps({"ok": False, "error": "No test data to evaluate."}))
            return 0

        num_classes = 0
        for _, targets in batches:
            num_classes = max(num_classes, int(targets.max().item()) + 1)

        if class_names and len(class_names) >= num_classes:
            labels_out = class_names[:num_classes]
        else:
            labels_out = [f"class {i}" for i in range(num_classes)]

        def encode_filters(weight):
            """
            Pack kernels as RGB bytes, one filter after another.

            Each kernel is scaled by its own range rather than a shared one: a
            filter's structure is what carries meaning, and one large-magnitude
            kernel would otherwise flatten all the others to grey.
            """
            count = min(weight.shape[0], args.max_filters)
            channels = weight.shape[1]
            kh, kw = int(weight.shape[2]), int(weight.shape[3])

            kernels = weight[:count].detach().float()
            if channels >= 3:
                rgb = kernels[:, :3]
            elif channels == 1:
                rgb = kernels[:, :1].repeat(1, 3, 1, 1)
            else:
                rgb = torch.cat([kernels, kernels[:, :1]], dim=1)[:, :3]

            flat = rgb.reshape(count, -1)
            low = flat.min(dim=1, keepdim=True).values
            high = flat.max(dim=1, keepdim=True).values
            span = (high - low).clamp(min=1e-8)
            scaled = ((flat - low) / span * 255.0).round().clamp(0, 255)

            # [count][h][w][rgb], which is what an ImageData buffer wants.
            arranged = (
                scaled.reshape(count, 3, kh, kw)
                .permute(0, 2, 3, 1)
                .contiguous()
                .to(torch.uint8)
                .numpy()
            )
            return base64.b64encode(arranged.tobytes()).decode("ascii"), count, kh, kw

        frames = []
        kernel_h = kernel_w = 0

        for round_num in range(1, total_rounds + 1):
            path = checkpoint_path(round_num)
            if not path.exists():
                continue

            state = torch.load(path, map_location="cpu", weights_only=False)["model_state_dict"]
            model.load_state_dict(state)
            model.eval()

            encoded, count, kernel_h, kernel_w = encode_filters(model.state_dict()[filter_key])

            correct = np.zeros(num_classes, dtype=np.int64)
            support = np.zeros(num_classes, dtype=np.int64)

            with torch.no_grad():
                for inputs, targets in batches:
                    predicted = model(inputs).argmax(dim=1)
                    for cls in range(num_classes):
                        mask = targets == cls
                        support[cls] += int(mask.sum().item())
                        correct[cls] += int((predicted[mask] == cls).sum().item())

            total = int(support.sum())
            frames.append({
                "round": round_num,
                "filters": encoded,
                "filterCount": count,
                "accuracy": (int(correct.sum()) / total) if total else None,
                "perClass": [
                    {
                        "label": labels_out[cls],
                        "accuracy": (int(correct[cls]) / int(support[cls])) if support[cls] else None,
                        "support": int(support[cls]),
                    }
                    for cls in range(num_classes)
                ],
            })

        if not frames:
            print(json.dumps({"ok": False, "error": "No checkpoints found for this experiment."}))
            return 0

        weight = model.state_dict()[filter_key]
        print(json.dumps({
            "ok": True,
            "view": "filters",
            "encoding": "uint8-rgb-base64",
            "inputShape": input_shape,
            "clientId": args.client,
            "layerName": filter_key,
            "kernelHeight": kernel_h,
            "kernelWidth": kernel_w,
            "inputChannels": int(weight.shape[1]),
            "totalFilters": int(weight.shape[0]),
            "classNames": labels_out,
            # Exactly what the accuracies were counted over, so the panel can say so.
            "evalSamples": int(sum(int(targets.numel()) for _, targets in batches)),
            "evalSource": "pooled client test splits",
            "frames": frames,
        }))
        return 0

    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        return 0
    finally:
        manager.close()


if __name__ == "__main__":
    sys.exit(main())
