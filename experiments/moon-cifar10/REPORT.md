# Can an AI assistant optimise federated learning runs? A CIFAR-10 study on Flower Testbed

Every run, decision and failed attempt behind this report is in
[`LOG.md`](LOG.md), with experiment IDs, so any number here can be traced to
the run that produced it.

---

## In one paragraph

We gave an AI assistant (Claude, working through the testbed's MCP tools) a
plain federated learning run and asked it to make the run better without
changing the algorithm, the model, the data or the budget. It read the
training curves, diagnosed the problem, changed two settings, and improved the
baseline by **+0.9 points on the held-out test set** (5 runs each), with run-to-run
variance halved. We then ran a published method built for this exact problem,
**MOON** (CVPR 2021), in the same setup. The AI's tuning of plain FedAvg comes
within 0.2 points of MOON, which is a statistical tie, and is twice as consistent across runs.
Applying the same tuning to MOON lifted it on validation (+1.0) but only
slightly on test (+0.3, within noise). All three improved methods end up about
one point above plain FedAvg.

---

## The setup

| | |
|---|---|
| Task | CIFAR-10 image classification |
| Clients | 10, all taking part in every round |
| Data split | Dirichlet label skew β = 0.5 (each client sees a skewed mix of classes; client sizes range from 950 to 7,143 images) |
| Model | MOON's simple CNN with a 256-d projection head |
| Budget | 100 rounds, 10 local epochs per round, SGD (lr 0.01, momentum 0.9), batch 64 |
| Platform | Flower Testbed on a 64-core university server; Flower simulation, 1 CPU per client |

**How we kept it honest:**
- **No tuning on the test set.** 5,000 training images are held out as a
  validation set. Every decision was made on validation. The 10,000-image test
  set was used only to score finished runs.
- **Repeats.** The final baseline and the AI-tuned configuration were each run
  5 times. Results are mean ± std across runs.
- **Stable metric.** Accuracy averaged over rounds 91–100, not one lucky round.
- **Same budget.** Only settings changed: same rounds, model, data and clients.
- **Everything logged,** including the attempts that made things worse.

---

## Check 1: can the AI improve a run?

**The baseline.** Plain FedAvg reaches **71.19% ± 0.77** on validation and
**70.36% ± 0.81** on test (5 runs).

**The diagnosis.** Reading the curves through MCP, the assistant saw that:
- accuracy stopped improving around round 40 and then swung by ±1 point every round;
- the clients' training accuracy kept climbing to ~80% while validation sat at ~71%.

Its reading: the learning rate stays too high late in training, and the clients
overfit their skewed shards.

**What it tried** (one change at a time, then combinations):

| Attempt | Change | Val | Outcome |
|---|---|---|---|
| R3a | learning rate decays over rounds, 0.01 → 0.001 | 71.32 | smoother, small gain |
| R3b | 5 local epochs instead of 10 | 70.31 | no gain, but half the compute |
| R3c | server momentum (FedAvgM) | 69.34 | worse, slower to converge |
| R3d | weight decay 5e-4 instead of 1e-5 | 71.64 | best single change |
| R3e | weight decay 1e-3 | 72.04 | |
| **R4a** | **LR decay + weight decay 5e-4** | **72.37** | **best; kept** |
| R4b | LR decay + weight decay 1e-3 | 70.75 | no better |
| R4c | LR decay + weight decay 2e-3 | 70.72 | no better |

The assistant ran 9 exploratory runs, then confirmed the pick with 5 fresh repeats.

**The result (5 runs each):**

| | Baseline (FedAvg) | AI-tuned (R4a) | Gain |
|---|---|---|---|
| Validation | 71.19 ± 0.77 | **72.17 ± 0.21** | **+1.0** |
| Test | 70.36 ± 0.81 | **71.23 ± 0.54** | **+0.9** |

- Every tuned run beats the baseline's average, on both validation and test.
- The tuned runs vary much less: validation std 0.21 vs 0.77.
- On test the gain is at the edge of statistical significance with 5 runs
  (Welch t = 2.0; one-sided p ≈ 0.04, two-sided p ≈ 0.09). It is consistent but modest.

**Why it works (ablation, validation):**

| Config | Runs | Val | vs baseline |
|---|---|---|---|
| LR decay only | 2 | 70.92 | +0.1 |
| Weight decay only | 2 | 71.48 | +0.6 |
| Both | 5 | 72.17 | +1.0 |

The two changes only work **together**. Lowering the learning rate alone just
lets clients overfit their shards harder. With weight decay holding that back,
the lower late learning rate settles into a better model.

---

## Check 2: is the gain worth anything compared with real research?

MOON is a published algorithm designed for exactly this problem: skewed data
across clients. It adds a contrastive loss that keeps each client's model close
to the global one. We implemented it in the testbed's client (off by default),
verified that the loss behaves as expected, and ran it **in our exact setup**
with the paper's settings (μ = 5, τ = 0.5).

| Method | Who made it | Runs | Val | Test |
|---|---|---|---|---|
| FedAvg | standard | 5 | 71.19 ± 0.77 | 70.36 ± 0.81 |
| **FedAvg + AI tuning** | **the AI, through MCP** | 5 | **72.17 ± 0.21** | **71.23 ± 0.54** |
| MOON | published paper, run by us | 3 | 71.78 ± 1.19 | 71.47 ± 1.21 |
| **MOON + AI tuning** | **the AI, through MCP** | 3 | **72.79 ± 1.43** | **71.77 ± 0.82** |
| *MOON, paper's reported number* | *paper (different setup; context only)* | *3* | | *69.1* |

**What this shows:**
- In our setup, MOON beats FedAvg by **+1.1 points on test**, much less than
  the +2.8 the paper reports. Our FedAvg baseline is stronger than the paper's.
- **AI-tuned FedAvg and MOON are statistically tied** (0.2 points apart, t ≈ 0.3).
  Tuning two existing settings recovers about 80% of MOON's gain without a new
  algorithm.
- The tuned FedAvg is also **more reliable**: its spread across runs is less
  than half of MOON's (0.54 vs 1.21 on test). One MOON run reached 72.9%; the
  other two reached 70.8%.
- MOON costs about **30% more compute per round** (each batch also passes
  through the global and the previous model).
- **The AI's tuning transfers to MOON, but the test gain is small.** The AI
  applied the same two changes to MOON and checked MOON's own μ (1, 5, 10).
  μ = 5 won, with the best single run of the study (73.93% validation). Over 3
  runs, MOON + tuning reaches 72.79% validation (+1.0 over MOON) and 71.77%
  test (+0.3, within noise). The first run was partly luck: it won the μ
  search, and the two fresh runs average 71.34% test.
- **All three improved methods meet at the same place.** On test, tuned
  FedAvg (71.23), MOON (71.47) and tuned MOON (71.77) are statistically
  indistinguishable, each about one point above plain FedAvg (70.36). Only
  tuned MOON vs plain FedAvg clears the usual significance bar (t ≈ 2.35).

---

## What we learned about doing this properly

1. **Single runs lie.** Five runs of the same baseline ranged from 69.9% to
   71.9% on validation, a 2-point spread. Two weight-decay settings that should behave alike came out 1.3
   points apart. Only repeated runs can separate configurations closer than
   ~1.5 points.
2. **Gains shrink on the test set.** Picking the best of ~10 configurations on
   the same validation images flatters the winner. The AI-tuned FedAvg gained
   +1.0 on validation but +0.9 on test. Tuned MOON's first run looked like a
   +2 point win; two fresh runs brought it back to +0.3 on test. Holding out a validation set and
   scoring test only at the end is what makes the final number trustworthy.
3. **The paper's numbers aren't a target.** Our plain FedAvg (70.3% test on the
   full training set) already beats the paper's MOON (69.1%), because data
   splits, seeds and code differ. Only methods run in the same setup can be
   compared.
4. **The testbed caught a real bug.** Before this work, the client never applied
   FedProx's proximal term or weight decay, so "FedProx" trained exactly like
   FedAvg. It was fixed and the affected runs were discarded.

---

## Honest limitations

- One dataset (CIFAR-10), one data skew (β = 0.5), one model. The gains may
  differ elsewhere.
- 3–5 runs per configuration. The FedAvg test gain is borderline significant.
- Clients are simulated, so there are no dropouts or slow clients. That flatters
  every method equally, but real deployments would be noisier.
- The AI's search was guided, not exhaustive: 9 exploratory runs for FedAvg and
  3 for MOON. We did not compare against a random search with the same number of runs.
- MOON is our implementation in the testbed, not the authors' code. Its loss
  was checked (it starts at the expected 5·ln 2 ≈ 3.47), but small
  implementation differences are possible.

---

## Reproducing this

- Model: `model.py`; MOON runs use the same network with `forward_with_projection` added.
- Data: `dataset_val.py` (tuning) and `dataset_test.py` (final scoring); the same
  client partitions.
- Strategies: `strategy_lr_cosine.py` (LR decay), `strategy_fedavgm.py` (server momentum).
- Settings: `customConfig` per run, listed in `LOG.md`.
- Test scores: `test_scores_r91_100.txt`, produced with
  `runner/eval_runner.py <id> <round> --dataset <dataset_test.py>`.
- Image: Flower Testbed v0.2.2 for the FedAvg runs and v0.2.3 for the MOON runs
  (v0.2.3 only adds the optional MOON loss; FedAvg training is unchanged).
