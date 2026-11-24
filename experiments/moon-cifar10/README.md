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

## Tuning protocol (from B onward)

Goal: show that the testbed plus the assistant improves a baseline run with the same budget, using existing strategies and hyperparameters only. The target is our own baseline B, not the paper's numbers (see "Known differences").

- **No tuning on the test set.** `dataset_val.py` holds out 5,000 CIFAR-10 training images (seed-42 shuffle, 90/10 divide) as a global validation set, and partitions the other 45,000 across the 10 clients (Dirichlet β=0.5, seed 0). Every tuning run evaluates on validation, and every decision is made on validation accuracy.
- **Test is scored once, at the end.** `dataset_test.py` is identical except `EVAL_SPLIT = "test"`, so the training partitions are the same (checked: identical partitions, 0 validation images in any client's data). Final picks are scored by running `runner/eval_runner.py <id> 100 --dataset <dataset_test.py>` on their round-100 checkpoint. This was checked on R1: it reproduces the recorded 70.10% exactly.
- **3 repetitions** for the baseline and for the final configuration (unseeded init and shuffling, fixed data split); report mean ± std.
- **Metric:** mean validation accuracy over rounds 91–100, which is less noisy than one round. A win must beat B by clearly more than its rep-to-rep spread.
- **Same budget:** 100 rounds, same model, same split, 10 clients all participating.
- **Every attempt is logged** with its reasoning, including the ones that do worse.

## Results

| # | Method | Source | Test accuracy (round 100) | Best round | Notes |
|---|---|---|---|---|---|
| P1 | FedAvg | Paper, Table 1 (3 runs) | 66.3% ± 0.5 | | |
| P2 | FedProx | Paper, Table 1 | 66.9% ± 0.2 | | |
| P3 | MOON | Paper, Table 1 | 69.1% ± 0.4 | | new algorithm |
| F1 | FedProx | Flower baseline (1 run) | 68.52% | | |
| F2 | MOON | Flower baseline (1 run) | 70.71% | | |
| R1 | FedAvg | Flower Testbed (grace1, v0.2.2) | 70.10% | 82 (70.94%) | mean of rounds 91–100: 70.34% (range 69.17–70.89). Plateau from ~round 40. Run `f6671625`, 85 min |
| R2 | FedProx μ=0.01 | Flower Testbed (grace1, v0.2.2) | 70.71% | 67 (71.32%) | mean of rounds 91–100: 70.41% (range 69.21–71.20). Tied with R1 within round-to-round noise. Run `3198b602`, 87 min |

The rows below use the tuning protocol (45k train, validation split; test = mean of rounds 91–100 of each run's checkpoints on the 10k test set). They are not comparable with R1/R2 above, which trained on 50k.

| # | Method | Reps | Val (mean r91–100) | Test (mean r91–100) | Notes |
|---|---|---|---|---|---|
| B | FedAvg baseline | 5 | 71.19 ± 0.77 | 70.36 ± 0.81 | R1 settings |
| R4a | FedAvg + AI tuning | 5 | 72.17 ± 0.21 | 71.23 ± 0.54 | cosine LR 0.01→0.001 + weight decay 5e-4; found in 9 exploratory runs |
| M1 | MOON as published, run by us | 3 | 71.78 ± 1.19 | 71.47 ± 1.21 | μ=5, τ=0.5, B's settings otherwise |
| MT1 | MOON + AI tuning | 3 | 72.79 ± 1.43 | 71.77 ± 0.82 | R4a's changes + MOON μ=5; best of μ ∈ {1, 5, 10} on validation. Fresh reps 2–3 alone: 72.22 val / 71.34 test |

Every run, decision and failed attempt is in `LOG.md`.

## Known differences from the paper

- The paper reports the mean of 3 runs. Ours is 1 run unless time allows more.
- Partition seed and model initialisation differ from the paper's, so expect about ±1–2 points of variance.
- FedProx μ = 0.01 is the value I believe the paper's tuning found for CIFAR-10. Check it against the paper's appendix before reporting.
- Our baselines land about 4 points above the paper's (FedAvg 70.3% vs 66.3%, FedProx 70.4% vs 66.9%), and above the paper's MOON (69.1%). The Flower baselines show the same shift (FedProx 68.52%, MOON 70.71%). So the paper's absolute numbers are not a fair target in this setup: compare against our own R1, not against 69.1%.
- R1 and R2 were run on image v0.2.2 (proximal term and weight decay applied on the client). Earlier runs on the older image ignored weight decay and FedProx's proximal term; they are kept in the database but are not used in this table.
- Platform fix made for this work: before it, the client never applied FedProx's proximal term, so "FedProx" in the app trained exactly like FedAvg (`runner/pytorch/client.py`). It also ignored weight decay.
