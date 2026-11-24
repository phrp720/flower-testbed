"""
R3a: FedAvg with a per-round cosine learning-rate decay on the clients.

The platform's on_fit_config_fn sends every client the base learning rate
(the experiment's learningRate, 0.01) each round. This strategy keeps
everything else from FedAvg and only rescales that value before it is sent:

    lr(round) = LR_MIN + (lr_base - LR_MIN) * 0.5 * (1 + cos(pi * (round - 1) / (NUM_ROUNDS - 1)))

so round 1 trains at 0.01 and round 100 at 0.001.

Why: in the baseline, accuracy stops improving around round 40 and then
oscillates by about +-1 point while client training accuracy keeps rising.
That suggests the learning rate stays too high late in training.
"""
import math

from flwr.server.strategy import FedAvg

NUM_ROUNDS = 100
LR_MIN = 0.001


class FedAvgCosineLR(FedAvg):
    def configure_fit(self, server_round, parameters, client_manager):
        instructions = super().configure_fit(server_round, parameters, client_manager)
        progress = (server_round - 1) / max(NUM_ROUNDS - 1, 1)
        scale = 0.5 * (1 + math.cos(math.pi * min(progress, 1.0)))
        for _, fit_ins in instructions:
            base = float(fit_ins.config.get("learning_rate", 0.01))
            fit_ins.config["learning_rate"] = LR_MIN + (base - LR_MIN) * scale
        if instructions:
            print(f"[Strategy] round {server_round}: learning_rate="
                  f"{instructions[0][1].config['learning_rate']:.6f}")
        return instructions


def get_strategy():
    # fraction_fit/evaluate 1.0 = all 10 clients every round, as in the baseline.
    # on_fit_config_fn and the metric aggregators are injected by the platform.
    return FedAvgCosineLR(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=10,
        min_evaluate_clients=10,
        min_available_clients=10,
    )
