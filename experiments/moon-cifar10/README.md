# MOON CIFAR-10 reproduction experiment

Reference: Li, He, Song, *Model-Contrastive Federated Learning*, CVPR 2021 (arXiv 2103.16257), Table 1, CIFAR-10.

## Setup (the paper's, mirrored in the app)

| Setting | Paper | In the app |
|---|---|---|
| Model | simple-CNN + projection head (256) | upload `model.py` |
| Data split | Dirichlet β = 0.5, 10 parties | upload `dataset.py` (does its own split, seed 0) |
| Test set | global CIFAR-10 test (10k) | `dataset.py` returns the global test set to every client |
| Clients / participation | 10, all every round | `num_clients` 10, `client_fraction` 1.0 |
| Rounds | 100 | `num_rounds` 100 |
| Local epochs | 10 | `local_epochs` 10 |
| Batch size | 64 | fixed in `dataset.py` |
| Optimiser | SGD, lr 0.01, momentum 0.9, wd 1e-5 | `learning_rate` 0.01; momentum is fixed at 0.9; customConfig `weight_decay` 1e-5 |

## Runs

Every run uses the same `model.py`, `dataset.py` and the settings above. Only `customConfig` changes.

| Run | customConfig |
|---|---|
| R1 FedAvg | `{"strategy": "fedavg", "weight_decay": 1e-5}` |
| R2 FedProx | `{"strategy": {"name": "fedprox", "params": {"proximal_mu": 0.01}}, "weight_decay": 1e-5}` |
| R3+ Assistant | whatever the assistant proposes, starting from a clone of R1 |

Start with a 1-round run to time it, then multiply by 100 to estimate the full run.

For the assistant runs (part 3), keep the comparison fair:

- Same budget: 100 rounds and the same model, data split and test set. Only strategy and hyperparameters may change.
- Log every attempt the assistant makes, including the ones that did worse, together with its stated reasoning (`record_insight`).
- The target is MOON's 69.1%, reached here with existing strategies and no new algorithm.

## Results

| # | Method | Source | Test accuracy (round 100) | Best round | Notes |
|---|---|---|---|---|---|
| P1 | FedAvg | Paper, Table 1 (3 runs) | 66.3% ± 0.5 | | |
| P2 | FedProx | Paper, Table 1 | 66.9% ± 0.2 | | |
| P3 | MOON | Paper, Table 1 | 69.1% ± 0.4 | | new algorithm |
| F1 | FedProx | Flower baseline (1 run) | 68.52% | | |
| F2 | MOON | Flower baseline (1 run) | 70.71% | | |
| R1 | FedAvg | Flower Testbed | | | |
| R2 | FedProx μ=0.01 | Flower Testbed | | | |
| R3 | … | Testbed + assistant | | | what it changed and why |

## Known differences from the paper

- The paper reports the mean of 3 runs. Ours is 1 run unless time allows more.
- Partition seed and model initialisation differ from the paper's, so expect about ±1–2 points of variance.
- FedProx μ = 0.01 is the value I believe the paper's tuning found for CIFAR-10. Check it against the paper's appendix before reporting.
- Platform fix made for this work: before it, the client never applied FedProx's proximal term, so "FedProx" in the app trained exactly like FedAvg (`runner/pytorch/client.py`). It also ignored weight decay.
