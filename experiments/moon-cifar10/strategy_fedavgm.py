"""
R3c: FedAvgM (FedAvg with server momentum; Hsu et al. 2019).

Each round the server treats (current global - weighted client average) as a
pseudo-gradient and applies SGD with momentum to the global model:

    v = BETA * v + g;   w = w - SERVER_LR * v

SERVER_LR = 0.1 and BETA = 0.9 give an effective server step of
SERVER_LR / (1 - BETA) = 1.0, i.e. the same step size as plain FedAvg once the
momentum has built up, but averaged over recent rounds. Hsu et al. found an
effective step of about 1 works best. Plain server_lr 1.0 with momentum 0.9
would be a 10x larger step, which tends to diverge with 10 local epochs.

Why: the baseline's global accuracy swings by about +-1 point from round to
round after round 40; momentum smooths the global update.

Flower's FedAvgM needs the current global weights in self.initial_parameters.
The platform does not pass initial parameters to a custom strategy, so the
weights sent to clients each round are stored there in configure_fit.
"""
from flwr.server.strategy import FedAvgM

SERVER_LR = 0.1
BETA = 0.9


class FedAvgMTracked(FedAvgM):
    def configure_fit(self, server_round, parameters, client_manager):
        self.initial_parameters = parameters
        return super().configure_fit(server_round, parameters, client_manager)


def get_strategy():
    return FedAvgMTracked(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=10,
        min_evaluate_clients=10,
        min_available_clients=10,
        server_learning_rate=SERVER_LR,
        server_momentum=BETA,
    )
