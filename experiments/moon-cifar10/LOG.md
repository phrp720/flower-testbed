# MOON CIFAR-10: experiment log

A lab notebook for this experiment: every run (including stopped, discarded and
superseded ones), every decision with the reason it was taken, and every change
to the platform that affects how a result should be read. Newest entries go at
the bottom of each section. Nothing listed here has been deleted from the
testbed unless it says so.

`README.md` holds the setup and the results table; this file holds how we got
there.

---

## 1. Goal

**Original framing (README, before 2026-11-23):** reproduce the MOON paper's
CIFAR-10 baselines (FedAvg 66.3%, FedProx 66.9%), then let the assistant reach
MOON's 69.1% using existing strategies and hyperparameters only, with no new
algorithm.

**Revised goal (2026-11-23):** show that the testbed, driven by the assistant,
can **optimise a federated run**: start from a baseline and find a better
configuration with the same budget (100 rounds, same model, data split and
clients), changing only the strategy and hyperparameters.

**Why it changed:** our plain FedAvg baseline reached 70.3% on the test set,
above the paper's MOON (69.1%). The paper's absolute numbers come from a
different random data split, seeds and code, so they are not a valid target in
our setup (see §5). The target became our own baseline, and MOON's reported
gain over FedAvg (+2.8 points) became a yardstick for how large a gain from
tuning is worth reporting.

---

## 2. Setup (unchanged throughout unless noted)

| Item | Value |
|---|---|
| Model | MOON simple-CNN with 256-d projection head (`model.py`); `forward()` returns logits, so training is plain cross-entropy |
| Data | CIFAR-10 (`uoft-cs/cifar10`), Dirichlet label skew β = 0.5, partition seed 0, 10 clients |
| Participation | all 10 clients every round (`clientFraction` 1.0) |
| Budget | 100 rounds, 10 local epochs |
| Optimiser | SGD, lr 0.01, momentum 0.9, weight decay 1e-5 (`customConfig.weight_decay`) |
| Batch | 64 (train), 256 (eval) |
| Augmentation | reflect-pad 4, random crop 32, horizontal flip |
| Clients | virtual (Flower simulation on Ray), 1 CPU each, no GPU |

---

## 3. Chronological log

### 2026-11-22: first attempts on the laptop (discarded)

| Run (local app) | What | Result | Status |
|---|---|---|---|
| `627f2408` MOON R1 FedAvg — 1-round timing | 1-round timing run | 21.1% test after round 1; 76 s per round | completed; timing only |
| `07221e20` MOON R1 FedAvg | full 100-round R1 | 58.8% at round 6 | **stopped by user** at round 6 to spare the laptop |

**Decision:** move all runs to the grace1 server (64 CPUs) instead of the
laptop. **Why:** a 100-round run is about 2 hours of full CPU load, and the
laptop was needed for other work.

### 2026-11-22: grace1 on the old image (discarded)

| Run (grace) | What | Result | Status |
|---|---|---|---|
| `7e851c11` MOON R1 FedAvg — 1-round timing | smoke test of the server deployment | 10.1% test after round 1; 75 s | completed, later deleted from the UI |
| `eeb4cd2e` MOON R1 FedAvg | full R1 | 39.5% at round 2 | **stopped** at round 3; later deleted from the UI |

**Finding:** the image on grace (`phrp5/flower-testbed:latest`, built
2026-11-18) predated commit `5110e97`. Its client applied **neither the FedProx
proximal term nor weight decay**: `runner/pytorch/client.py` had 0 matches for
`proximal_mu` and `weight_decay`. On that image, FedProx trains exactly like
FedAvg, and R1 ignores `weight_decay`.

**Decision:** stop R1, publish a new image, and rerun everything on it.
**Why:** R1 and R2 must run the same client code, and R2 would have been
meaningless on the old image.

**Side effect:** deleting these two runs from the UI also deleted the uploaded
`model.py` and `dataset.py` they referenced, because the app removes uploads
that no surviving experiment points at. The files were uploaded again from the
agent workspace. Rule adopted afterwards: **never delete any run or file**;
everything is needed for the write-up.

### 2026-11-22/23: image v0.2.2, baselines R1 and R2 (kept)

- Release `v0.2.2` published; the "Image Deployment" GitHub workflow built and
  pushed `phrp5/flower-testbed` (run 45073512551). On grace, the image's
  `runner/pytorch/client.py` has SHA-1 `3a857f5a…`, identical to the repo's.
- `RAY_NUM_CPUS` raised from 8 to 10, so all 10 clients train at once instead
  of in two batches.

| Run (grace) | What | Result | Notes |
|---|---|---|---|
| `1e8b1460` MOON R2 FedProx μ=0.01 — 1-round check | does FedProx run with the proximal term on v0.2.2? | 22.1% after round 1 | server log: `Using FedProx strategy … (proximal_mu=0.01)` |
| `f6671625` **R1 FedAvg** | baseline vs paper | round 100: **70.10%** test; best 70.94% (round 82); **mean of rounds 91–100: 70.34%** (69.17–70.89) | 85 min. Plateaus from ~round 40 |
| `3198b602` **R2 FedProx μ=0.01** | baseline vs paper | round 100: **70.71%**; best 71.32% (round 67); **mean of rounds 91–100: 70.41%** (69.21–71.20) | 87 min |

**Findings:**
1. FedAvg and FedProx are **tied** in our setup: 0.07 points apart, against a
   round-to-round swing of about ±1 point. The paper reports FedProx 0.6 points
   ahead.
2. Both baselines are **about 4 points above the paper's** and above the paper's
   MOON. The Flower baselines show the same upward shift (FedProx 68.52%, MOON
   70.71%). Likely causes: a different Dirichlet draw (our split is very uneven:
   client 0 has 1,057 images, client 4 has 7,938), single runs versus the
   paper's mean of 3, and framework/initialisation differences. Virtual
   clients are **not** a likely cause: simulation runs the same SGD and
   averaging, and the paper also simulated. It does remove dropouts and
   stragglers, which flatters any simulated result compared with a real
   deployment, but it does not explain a gap against the paper's own simulated
   numbers.
3. **Diagnosis for tuning:** test accuracy is about 69% by round 40 and then
   oscillates, while client training accuracy keeps rising to about 79%. That
   is consistent with a learning rate that stays too high late in training,
   and with client drift on skewed data.

**Decision:** we have not run MOON itself. Our runs use MOON's model and setup,
but not its model-contrastive loss. Running MOON would need that loss added to
the client, which is a platform change. Deferred; see §6.

### 2026-11-23: protocol fix before tuning: validation split

**Problem:** the per-round accuracy so far is measured on the **test set**.
Choosing configurations by it, and then reporting it, overstates the gain. That
is tuning on the test set.

**Decision:**
- `dataset_val.py`: hold out 5,000 training images (flwr-datasets shuffle seed
  42, then `Divider` 90/10) as a global validation set, and partition the other
  45,000 across the 10 clients (Dirichlet β=0.5, seed 0). Every tuning run is
  scored on validation.
- `dataset_test.py`: identical except `EVAL_SPLIT = "test"`. It is used only to
  score the round-100 checkpoints of the final picks, with
  `python runner/eval_runner.py <id> 100 --dataset uploads/datasets/<dataset_test.py>`
  run in the app container. The MCP `evaluate_checkpoint` tool does not expose
  `--dataset`.
- Report the mean of 3 repetitions, ± std, for the baseline and the final
  configuration.
- Metric: mean validation accuracy over rounds 91–100.

**Checks, run in the grace app container with the training-time library
versions (flwr 1.44.0, flwr-datasets 0.6.1):**
- the val and test files produce **identical** client partitions;
  sizes `[950, 4842, 5126, 5703, 7143, 4790, 5507, 2281, 4979, 3679]`, sum 45,000;
- the validation set has 5,000 images, 484–528 per class;
- **0** validation images appear in any client's training data;
- the end-of-run scoring step reproduces R1's recorded result exactly (70.10%,
  loss 0.8456) on R1's round-100 checkpoint.

Uploaded as `uploads/datasets/1795391156721_dataset_val.py` and
`uploads/datasets/1795391156741_dataset_test.py`.

**Consequence:** the new baseline **B** trains on 45k instead of 50k images and
is scored on validation, so its numbers are not comparable with R1/R2. R1/R2
remain the paper-comparison runs; B is the baseline for tuning.

| Run (grace) | What | Result |
|---|---|---|
| `663a2d2f` B FedAvg baseline — val split, rep 1/3 | R1 settings on the validation split | val, mean r91–100: **69.91%**; round 100: 70.42% |
| `ad0376f0` B FedAvg baseline — val split, rep 2/3 | same | **71.10%**; round 100: 70.88% |
| `5f3f6d7c` B FedAvg baseline — val split, rep 3/3 | same | **71.51%**; round 100: 71.46% |

**Result: B = 70.84% ± 0.83 (mean ± sample std of the 3 reps' r91–100 means; range 69.91–71.51).**
Client training accuracy at round 100 is about 79–80% in every rep, so the
same train/val gap seen in R1 is present.

**Finding:** rep-to-rep spread (1.6 points between the worst and the best
rep) is larger than the round-to-round noise inside a run. A single run
cannot show a gain of about 1 point.

**Decision: what counts as a win.**
- A single tuning run is **promising** only if its r91–100 mean is above
  **72.5%**, about 2 std above B's mean and 1 point above B's best rep.
- A configuration counts as an **improvement** only after 3 reps whose mean
  beats B's mean by more than 2 std of the difference
  (about 1.4 points with 3 reps each, i.e. ≥ 72.3%).
- **Why:** with 0.83 std per run, a one-run gain under ~1.7 points is
  indistinguishable from picking a lucky seed.

**Server load:** 3 runs at a time (30 Ray CPUs of grace's 64), not more,
because grace is shared. The load average was about 19 with the 3 B runs
active.

### 2026-11-23: decision to run MOON ourselves (code ready, not deployed)

**Why:** our FedAvg already beats the paper's MOON, so the paper's MOON number
cannot be compared with ours. A fair three-way comparison (FedAvg baseline,
FedAvg + assistant tuning, MOON) needs MOON run in our exact setup: same split,
model, budget and validation protocol. The user asked for this.

**Change (on branch `filippos/experiment`, uncommitted, not yet in an image):**
- `runner/pytorch/client.py`: optional MOON model-contrastive term, on only
  when the fit config has `moon_mu > 0`. Loss = CE + μ·CE([cos(z, z_glob),
  cos(z, z_prev)]/τ, label 0), with frozen copies of the round's global model
  and the client's previous local model. The previous local model is saved
  per partition under `checkpoints-data/client_state_<experiment id>/`,
  because simulation recreates clients every round. Before a client's first
  training, the previous model is the global model, as in the MOON reference
  code.
- `runner/pytorch/simulation.py`: forwards `customConfig.moon_mu` and
  `moon_temperature` (default 0.5) into the fit config.
- `model.py`: adds `forward_with_projection(x) -> (z, logits)`; `forward()`
  is unchanged, so FedAvg/FedProx train exactly as before.

**Check (laptop, synthetic batch):** with the positive and negative models
identical, the contrastive term is ln 2, as expected: loss 5.77 = 2.30 CE +
5·0.693. The state file is written, and a fit without `moon_mu` is unchanged.

**Planned MOON run:** paper's CIFAR-10 settings, μ = 5, τ = 0.5, buffer size
1, B's settings otherwise, `dataset_val.py`, 3 reps. Needs a new image
release first (the user publishes).

---

## 4. Tuning attempts (R3 onward)

All attempts use `dataset_val.py`, start from B's settings, and change one thing
at a time unless stated otherwise. Each row says what changed, why, and what
happened, including attempts that did worse.

| Run | Change from B | Why | Val acc (mean r91–100) | vs B | Kept? |
|---|---|---|---|---|---|
| R3a `86f4ee6b` | cosine LR decay per round, 0.01 (r1) → 0.001 (r100); strategy `strategy_lr_cosine.py` | plateau from ~round 40 with ±1 pt oscillation while client train acc keeps rising; a lower late LR should settle it | **71.32%** (71.0–71.6); round 100: 71.24%; client train acc 81.3% | +0.48 (below the 72.5% bar) | partly: much smoother late curve (range 0.6 pts vs ~1–2 in B), small gain; but the train/val gap grew (train 81%), so it is combined with stronger weight decay in R4a |
| R3b `408c1666` | 5 local epochs instead of 10 | less client drift per round on skewed data | **70.31%** (69.8–70.9); round 100: 70.48%; client train acc 77.4% | −0.53 (within noise) | no: no gain. Same accuracy at **half the client compute**, worth a line in the report |
| R3d `ca8d2fcb` | weight decay 5e-4 instead of 1e-5 | every B rep ends with clients at ~79–80% train acc vs ~71% val, a generalisation gap; 1e-5 barely regularises, 5e-4 is the usual CIFAR CNN value | **71.64%** (70.9–72.1); round 100: 70.88%; client train acc 77.7% | +0.80 (below the 72.5% bar alone) | yes, as part of R4: best single change; the train/val gap shrank from ~8–9 to ~6 points, as intended |
| R3e `2d7cb8b8` | weight decay 1e-3 | brackets R3d to find how much regularisation helps | **72.04%** (71.5–72.4); round 100: 72.44%; client train acc 77.4% | +1.20 | yes: stronger weight decay helps more than 5e-4 (71.64%), so R4b/R4c try 1e-3 and 2e-3 with the LR decay |
| R4a `c569fb42` | cosine LR (R3a) **+** weight decay 5e-4 (R3d) | R3a fixes the late oscillation but widens the train/val gap; R3d's weight decay narrows the gap. Started before R3d finished, because R3d was clearly ahead of B at round 59 and waiting would have left a slot idle for ~40 min | **72.37%** (71.9–72.7); round 100: 72.56%; client train acc 81.5% | **+1.53** (just under the 72.5% single-run bar) | leading candidate so far; reps started |
| R4a rep 2 `a825645f` | same as R4a | R4a was ahead of every run at round 54, and any claim needs 3 reps. Started in R3d's slot instead of another single exploratory run, because confirming the leading candidate is the critical path | **72.17%** (71.7–72.5); round 100: 72.22%; client train acc 81.4% | +1.33 | consistent with rep 1 (2-rep mean 72.27%) |
| R4a rep 3 `a907153a` | same as R4a | completes the 3-rep confirmation. At round 56, R4b (70.5%) and R4c (70.0%) were behind R4a rep 1 at the same point (72.2%), so R4a stayed the leading candidate | **71.89%** (71.5–72.2); round 100: 72.18%; client train acc 81.5% | +1.05 | 3-rep mean **72.14 ± 0.24** |
| R4b `ad9b23ed` | cosine LR + weight decay **1e-3** | alone, wd 1e-3 (R3e) beat 5e-4 (R3d) by 0.4, so the combination may gain from the stronger value | **70.75%** (70.4–71.2); client train acc 80.9% | −0.09 | no |
| R4c `3d841e57` | cosine LR + weight decay **2e-3** | brackets R4b from above, to find where more weight decay stops helping | **70.72%** (70.3–71.0); client train acc 79.0% | −0.12 | no |
| R3a rep 2 `79acc01d` | cosine LR only (ablation) | with R3d rep 2 and R4a's 3 reps, splits R4a's gain between its two parts | **70.52%** (70.2–70.9); client train acc 80.8% | −0.32 | 2-rep mean with R3a: **70.92%** (+0.08) |
| R3d rep 2 `b6623e46` | weight decay 5e-4 only (ablation) | same | **71.32%** (70.9–71.7); client train acc 77.8% | +0.48 | 2-rep mean with R3d: **71.48%** (+0.64) |
| B rep 4 `f63d078f` | none (baseline) | 5 vs 5 for the final comparison | **71.59%** (70.0–73.0); test r91–100 **70.40%**, r100 70.42% | +0.75 | baseline rep |
| R4a rep 5 `614349cd` | same as R4a | 5 vs 5 (started when B rep 4 finished) | **72.37%** (71.9–72.8); test r91–100 **71.95%**, r100 72.16% | +1.53 | R4a rep. **Last run of the night** (the user asked for no new runs because internet access would be lost) |
| R4a rep 4 `c6dba65f` | same as R4a | 5 vs 5 | **72.07%** (71.5–72.6); test r91–100 **71.15%**, r100 71.19%; client train acc 81.3% | +1.23 | R4a rep |
| B rep 5 `323befee` | none (baseline) | 5 vs 5 | **71.85%** (71.3–72.4); test r91–100 **70.22%**, r100 69.98% | +1.01 | baseline rep |

**Ablation (validation, mean r91–100):**

| Config | Reps | Mean | vs B |
|---|---|---|---|
| B | 3 | 70.84 | — |
| LR decay only | 2 | 70.92 | +0.08 |
| Weight decay 5e-4 only | 2 | 71.48 | +0.64 |
| Both (R4a) | 3 | 72.14 | +1.30 |

**Finding:** the two changes **interact**. LR decay alone does nothing;
weight decay alone gives about half the gain; together they give about
twice the gain of weight decay alone. A plausible reading: without
regularisation, the lower late LR just lets clients fit their skewed shards
harder (train acc 81% vs 79%), with no gain on held-out data; with weight
decay, the same decay settles into a better-regularised solution. Only 2–3
reps each, so the split is indicative.

**Finding (R4b/R4c):** both land level with B, although wd 1e-3 alone
(R3e, 72.04%) was the second-best single run. A 1.3-point disagreement between
single runs that should be similar is consistent with B's rep-to-rep std of
0.83. Single runs cannot rank configurations less than ~1.5 points apart;
only the repeated R4a result is trustworthy. No more single-run exploration
of weight decay values: the remaining slots go to repeats.

**Note on selection bias:** each of these is one run, and the best of several
single runs is biased upwards, because the luckiest one gets picked. That is
why the pick is confirmed with 3 fresh reps and scored on the test set once.
| R3c `a2803a9c` | FedAvgM, server lr 0.1, momentum 0.9 (effective step 1.0); strategy `strategy_fedavgm.py` | smooths the noisy global updates. Server lr 1.0 with momentum 0.9 would be a 10× step; Hsu et al. 2019 found an effective step of ~1 best | **69.34%** (69.1–69.8); round 100: 69.84% | −1.50 | no: learns more slowly (67.3% at round 54) and is still behind at round 100. A larger server step might converge faster, but momentum was not pursued: the other directions were more promising |

R3 strategies were dry-run on grace before starting (`dry_run_strategy`: OK,
all 10 clients per round, platform aggregators injected). R3a's log confirms
`learning_rate=0.010000` at round 1, and R3c saved its round-1 checkpoint, so
FedAvgM's server step works with the current-weights fix described in its file.
Uploaded as `uploads/algorithms/1795396129780_strategy_lr_cosine.py` and
`uploads/algorithms/1795396129797_strategy_fedavgm.py`. Started 2026-11-23.

Mid-run note (round ~54): R3c (FedAvgM) is behind B at the same round
(67.3% vs ~70%) but still rising, with its best round the latest one. That
is expected while server momentum builds up, so it was left to finish rather
than judged early. R3a is level with B at round 54 (70.9%), before its
learning rate gets low.


### Test scores (B and R4a; R4a was fixed as the pick before any test score was seen)

Scored with `runner/eval_runner.py <id> <round> --dataset uploads/datasets/1795391156741_dataset_test.py`
in the grace app container (read-only: prints JSON, writes nothing). Raw
per-round numbers are in `test_scores_r91_100.txt`.

| Run | Test, round 100 | Test, mean r91–100 | Val, mean r91–100 |
|---|---|---|---|
| B rep 1 `663a2d2f` | 69.77% | 69.25% | 69.91% |
| B rep 2 `ad0376f0` | 70.71% | 70.38% | 71.10% |
| B rep 3 `5f3f6d7c` | 71.50% | 71.54% | 71.51% |
| **B mean** | **70.66%** | **70.39%** | **70.84%** |
| R4a rep 1 `c569fb42` | 71.32% | 71.57% | 72.37% |
| R4a rep 2 `a825645f` | 70.69% | 70.97% | 72.17% |
| R4a rep 3 `a907153a` | 70.85% | 70.53% | 71.89% |
| **R4a mean** | **70.95%** | **71.02%** | **72.14%** |

**3 vs 3 result:**

| | B | R4a | Difference | Welch t |
|---|---|---|---|---|
| Val, mean r91–100 | 70.84 ± 0.83 | 72.14 ± 0.24 | **+1.30** | ≈ 2.6 |
| Test, mean r91–100 | 70.39 ± 1.14 | 71.02 ± 0.52 | **+0.63** | ≈ 0.9 |
| Test, round 100 | 70.66 ± 0.87 | 70.95 ± 0.33 | +0.29 | ≈ 0.6 |

**Reading:**
- On validation, R4a is consistently better: all 3 reps (71.89–72.37) are
  above B's best rep (71.51). The mean is just short of the 72.3% bar set in
  advance, though.
- On test, the gain halves to +0.6 and is within the noise of 3 reps.
- R4a is **more stable**: its std is half of B's on both splits, and its
  worst test rep (70.53) is above B's worst (69.25).
- This is **not yet a claimable improvement** under our own rule.

**Decision:** add reps 4 and 5 of both B and R4a, for 5 vs 5, instead of
trying more configurations. **Why:** a further single-run search would add
more selection bias (see R4b/R4c). The open question is whether the test
gain is real, and only more reps answer it. B rep 4 `f63d078f` started.

**Protocol note:** the plan said to score only the round-100 checkpoint on
test. One checkpoint swings by about ±1 point from round to round, so the
test mean over rounds 91–100 is also reported. It matches the validation
metric and involves no choice: every round in the window is scored for every
run. Both are reported.

**Finding (2 of 3 R4a reps):** the gain **shrinks on test**: +0.88 points
(mean r91–100) against +1.43 on validation. R4a loses 1.0 point from
validation to test, while B loses 0.45. That is the expected selection bias
from choosing the best of ~10 configurations on the same 5,000 validation
images. With B's test spread (std ≈ 1.1 over 3 reps), +0.9 is not yet clearly
beyond noise. Wait for rep 3 before concluding.


### Final result, 5 vs 5 (2026-11-24)

| | B, FedAvg baseline (5 reps) | R4a, AI-tuned (5 reps) | Gain | Welch t (df) |
|---|---|---|---|---|
| **Validation**, mean r91–100 | 71.19 ± 0.77 | **72.17 ± 0.21** | **+0.98** | ≈ 2.8 (≈ 4.6) |
| **Test**, mean r91–100 | 70.36 ± 0.81 | **71.23 ± 0.54** | **+0.88** | 2.00 (7.0) |
| **Test**, round 100 | 70.48 ± 0.68 | 71.24 ± 0.57 | +0.77 | 1.93 (7.8) |

Per-rep values:
- **B val:** 69.91, 71.10, 71.51, 71.59, 71.85
- **R4a val:** 72.37, 72.17, 71.89, 72.07, 72.37
- **B test:** 69.25, 70.38, 71.54, 70.40, 70.22
- **R4a test:** 71.57, 70.97, 70.53, 71.15, 71.95

R4a = FedAvg + cosine client-LR decay 0.01 → 0.001 over the 100 rounds
(`strategy_lr_cosine.py`) + client weight decay 5e-4 instead of 1e-5. Same
model, data split, clients, rounds and local epochs as B.

**Conclusion:**
- R4a improves the baseline by about **+0.9 points on the held-out test set**
  (+1.0 on validation). It is **3.5× more stable** on validation (std 0.21
  vs 0.77), and every R4a rep beats B's mean on both splits.
- On test the gain is at the edge of significance with 5 reps: two-sided
  p ≈ 0.09, one-sided p ≈ 0.04. It is consistent but small. It is about a
  third of MOON's reported +2.8-point gain over FedAvg, reached with two
  hyperparameter/schedule changes and no new algorithm.
- It misses the +1.4-point bar we set in advance for an "improvement"
  (3-rep rule). Report it as a consistent, modest gain with lower variance,
  not as a large win.
- How it was found: 9 exploratory single runs (R3a–e, R4a–c), ablations, then
  5 confirmation reps. Lessons: single runs cannot rank configurations less
  than ~1.5 points apart; the gain shrinks from validation to test (selection
  bias); the two changes help together, not separately.


### 2026-11-23: MOON in our setup (check 2)

**Deployment:** release v0.2.3 (tag on `main` `9645252`, includes the MOON
client code) was pulled on grace and only the app container was recreated
(`docker-compose up -d --no-deps`). Postgres was not restarted and no data
was touched; all 22 completed runs were still there afterwards. The first
recreate failed because the old container did not stop in time, and the
replacement came up under a temporary name, which would break worker
launches (they look up the app container by `HOSTNAME`). It was recreated
again as `flower-testbed-app`.

**Model:** `uploads/models/1795427990628_model_moon.py`, the same network as
before plus `forward_with_projection()`. Weights and `forward()` are
identical.

| Run | What | Result | Notes |
|---|---|---|---|
| `dae1ba13` M1 1-round check | MOON μ=5, τ=0.5, 1 round | round-1 train loss **4.99** (plain FedAvg ≈ 1.5); val 15.2% | contrastive term active: ≈ 5·ln 2 = 3.47 at the start, as expected |
| `9369317a` M1 MOON rep 1/3 | MOON as published: B settings + μ=5, τ=0.5, buffer 1 | val **73.10%**; test r91–100 **72.86%**, r100 73.25% | ~110 min (2 extra forward passes per batch) |
| `1b7c3dba` M1 MOON rep 2/3 | same | val **71.48%**; test **70.79%**, r100 70.52% | |
| `b51d8b6b` M1 MOON rep 3/3 | same | val **70.77%**; test **70.75%**, r100 70.57% | |

**MOON vs FedAvg vs AI-tuned FedAvg (mean r91–100):**

| | Val | Test |
|---|---|---|
| B, FedAvg (5 reps) | 71.19 ± 0.77 | 70.36 ± 0.81 |
| R4a, AI-tuned FedAvg (5 reps) | 72.17 ± 0.21 | 71.23 ± 0.54 |
| M1, MOON as published (3 reps) | 71.78 ± 1.19 | 71.47 ± 1.21 |

**Findings:**
- In our setup, MOON beats FedAvg by **+1.1 points on test** (Welch t ≈ 1.4),
  far less than the paper's +2.8. Our FedAvg is a stronger baseline than the
  paper's (see §5).
- AI-tuned FedAvg (+0.9) and MOON (+1.1) are **statistically tied**
  (t ≈ 0.3): tuning existing settings recovers about 80% of MOON's gain
  with no new algorithm.
- MOON is **much less stable**. One rep reached 72.9% test, the other two
  70.8%, so its std (1.2) is about twice the tuned FedAvg's (0.54).
- Cost: a MOON run takes ~110 min vs ~85 min for FedAvg (+30%), because each
  batch also goes through the global and the previous model.

| Run | What | Why | Result |
|---|---|---|---|
| `2f52c1c4` MT1 | MOON μ=5 + cosine LR + wd 5e-4 | does the tuning that helped FedAvg also help MOON? | val **73.93%** (73.4–74.5); test r91–100 **72.62%**, r100 72.55%; train 81.1%. **Best single run of the whole study** |
| `c8b82e96` MT2 | MOON μ=1 + cosine LR + wd 5e-4 | with weight decay already regularising, a weaker contrastive term may suffice | val **71.92%**; test **70.70%**, r100 71.15% |
| `847a2f8d` MT3 | MOON μ=10 + cosine LR + wd 5e-4 | brackets μ=5 from above (the paper searched μ ∈ {0.1, 1, 5, 10}) | val **72.29%** (very stable, 72.2–72.5); test **72.16%**, r100 72.49% |

**Findings (single runs, so indicative only):**
- On validation, MT1 (μ=5 + the FedAvg tuning) is the best single run in the
  study: 73.93%, +1.8 over B's best rep and +2.15 over MOON as published
  (3-rep mean 71.78). The paper's μ=5 stays the best μ (μ=1 71.92, μ=10 72.29).
- The tuning that helped FedAvg **transfers to MOON**, so it is not specific to
  one algorithm.
- Caveat: these are single runs, and MOON as published has a large
  rep-to-rep spread (std 1.2; one rep reached 73.1% val). MT1 needs repeats
  before any claim.

**Protocol note:** MT1–3 were also scored on test, out of habit from scoring
every finished run. The choice of MT1 was made on validation only, where it
is clearly first. Its test score must not be used to pick between MT runs.
The test numbers above are recorded for completeness, and the final MOON+tuning
claim will use fresh reps.

**Next (agreed with the user):** 2 more reps of MT1 to confirm "MOON + AI
tuning" with 3 reps, like MOON as published.

| Run | What | Result |
|---|---|---|
| `58d1ee7f` MT1 rep 2/3 | same as MT1 | val **71.18%**; test r91–100 **70.98%**, r100 71.22% |
| `ae54ae2c` MT1 rep 3/3 | same as MT1 | val **73.26%**; test r91–100 **71.70%**, r100 71.72% |

**MOON + AI tuning, 3 reps (MT1 = rep 1, plus reps 2–3):**

| | Val | Test |
|---|---|---|
| MT1, 3 reps | 72.79 ± 1.43 | 71.77 ± 0.82 |
| MT1, fresh reps 2–3 only | 72.22 | 71.34 |
| M1, MOON as published, 3 reps | 71.78 ± 1.19 | 71.47 ± 1.21 |

**Findings:**
- The tuning lifts MOON by **+1.0 on validation but only +0.3 on test**
  (Welch t ≈ 0.35), within noise. Rep 1 (73.93 val) was partly a lucky
  pick: it won the μ search, and the two fresh reps average 72.22 val /
  71.34 test, the same selection bias seen with FedAvg.
- **All three improved methods land in the same place on test:**
  - AI-tuned FedAvg: 71.23 ± 0.54
  - MOON: 71.47 ± 1.21
  - MOON + tuning: 71.77 ± 0.82

  That is about +0.9 to +1.4 over FedAvg (70.36), and none of the three is
  separable from the others with 3–5 reps. Only MOON + tuning vs plain FedAvg
  clears t > 2 (t ≈ 2.35).
- MOON stays noisier than tuned FedAvg in every form (test std 0.8–1.2 vs 0.54).
- The tuning does not hurt MOON, so it is safe to transfer; whether it helps
  MOON on test is unresolved at 3 reps.

**Fairness note:** MOON uses B's settings (lr 0.01, wd 1e-5) plus the
paper's tuned μ and τ, i.e. MOON as published, untuned by us. Tuning MOON as
well (step 2) is planned so that both methods get comparable tuning effort.

---

## 5. Why the paper's numbers are not the target

| | Paper | Ours (R1/R2, test, mean r91–100) |
|---|---|---|
| FedAvg | 66.3% ± 0.5 | 70.34% |
| FedProx | 66.9% ± 0.2 | 70.41% |
| MOON | 69.1% ± 0.4 | not run |

Our FedAvg alone beats the paper's MOON, so "reaching 69.1%" proves nothing in
our setup. Claims are made against our own baseline only.

---

## 6. Platform and deployment changes that affect the results

| When | Change | Effect on results |
|---|---|---|
| before this work | `5110e97`: the client applies FedProx's proximal term and `weight_decay` | before it, "FedProx" trained exactly like FedAvg and weight decay was ignored |
| 2026-11-22 | image v0.2.2 published and pulled on grace | every kept run uses it |
| 2026-11-22 | grace deployment: pgvector image; `network_mode: host`, app on port 64000; worker socket set to the rootful Podman socket (it pointed at the rootless one, so workers could not start); `HOSTNAME=flower-testbed-app` (the app uses it to find its own container); Postgres bound to 127.0.0.1 | infrastructure only; no effect on training |
| 2026-11-22 | `RAY_NUM_CPUS` 8 → 10 | speed only (all clients train in parallel) |

---

## 7. Open items

- [x] B: mean ± std over 3 repetitions (70.84 ± 0.83); win threshold set (single run > 72.5%, 3-rep mean ≥ 72.3%).
- [x] R3a–e, R4a–c, ablations; pick R4a (cosine LR + wd 5e-4).
- [x] Final pick: 5 vs 5 reps on validation and test (r100 and mean r91–100). R4a +0.88 test, +0.98 val.
- [x] MOON in our setup: 3 reps, val 71.78 ± 1.19, test 71.47 ± 1.21.
- [x] MOON + AI tuning: MT1 3 reps, val 72.79 ± 1.43, test 71.77 ± 0.82 (+0.3 over MOON on test, within noise).
- [x] Final report: REPORT.md (two-checks framing).
- [ ] Optional: compare with random search over the same parameters and the same number of runs, to show the assistant is efficient, not just that tuning helps.
- [ ] Optional: other settings (β = 0.1, CIFAR-100).
- [ ] Check that μ = 0.01 is the paper's tuned FedProx value for CIFAR-10 (appendix).
- [ ] Reproduce the paper's absolute numbers (FedAvg 66.3, MOON 69.1) by matching the authors' code, then tune from there (goal restated by the user on 2026-11-24).

---

## 8. Matching the authors' code (2026-11-24, code reading only, no runs)

The user restated the goal: first get the paper's numbers, then improve them
with AI hyperparameter tuning. Our numbers sit about 4 points (FedAvg) and 2.4
points (MOON) above the paper's. Our setup was compared line by line with
github.com/QinbinLi/MOON (`main.py`, `utils.py`, `datasets.py`, README).

| Setting | Authors' code | Ours | Same? |
|---|---|---|---|
| Model | simple-cnn + 256-d projection head | same network | yes |
| Rounds / local epochs / clients | 100 / 10 / 10, all every round | same | yes |
| Optimiser | SGD lr 0.01, momentum 0.9, wd 1e-5, no LR schedule | same | yes |
| Batch | 64, `drop_last=True` | 64, keeps the last partial batch | minor |
| Train augmentation | reflect-pad 4, crop 32, flip, normalise | same (normalise constants equal to 3 decimals) | yes |
| Aggregation | FedAvg weighted by client data size | same (Flower weights by num_examples) | yes |
| MOON loss | CE + mu * CE([cos(z,z_glob), cos(z,z_prev)]/tau), mu 5, tau 0.5 | same | yes |
| MOON first round | previous model = the random initial model | check our client's first-round behaviour | to check |
| Training data | all 50,000 images | 45,000 (5,000 held out for validation) | **no** |
| **Dirichlet split** | own loop: per class, Dirichlet(0.5) proportions, **any client already holding >= 5,000 images gets weight 0** (a size cap), resample until every client has >= 10; numpy seed 0 | flwr-datasets `DirichletPartitioner`, `self_balancing=False` (no cap), seed 0; client sizes 950 to 7,143 | **no** |
| Reported accuracy | global model on the 10k test set, logged every round; last round | mean of rounds 91 to 100 | minor |

**Reading:** almost everything matches. The real difference is the data split:
a different algorithm, a cap on client size, and a different random draw, so
our clients see a different (seemingly easier) label skew. Holding out 5,000
images should make us lower, not higher, so it does not explain the gap.

**Evidence that the gap may not close fully:** Flower's own MOON baseline,
which follows the authors' code, also lands above the paper (MOON 70.71%,
FedProx 68.52%, single runs). So the paper's absolute numbers may be hard to
reproduce even with the authors' setup.

**Proposed next step (not run, waiting for the user):** a `dataset_paper.py`
that copies the authors' `partition_data` exactly (numpy seed 0, full 50k,
size cap, `drop_last=True`), then FedAvg and MOON, 3 reps each, test only. If
they land near 66.3 / 69.1, redo the AI tuning from that baseline; if they
stay near 70 / 71, report that the authors' own setup does not reproduce the
paper's numbers.
