"""
MOON simple-CNN for CIFAR-10 (Li et al., CVPR 2021, arXiv 2103.16257).

Same network as ModelFedCon(base_model="simple-cnn", out_dim=256, n_classes=10)
in github.com/QinbinLi/MOON/model.py: the LeNet-style feature extractor, the
two-layer projection head, and the classifier. The paper uses this network,
projection head included, for FedAvg and FedProx as well as MOON, so the
baselines here use it too.

forward() returns logits only, because the testbed's client calls
criterion(model(x), y).
"""
import torch.nn as nn
import torch.nn.functional as F


class Net(nn.Module):
    def __init__(self, num_classes: int = 10, out_dim: int = 256):
        super().__init__()
        # Feature extractor (SimpleCNN_header, hidden_dims=[120, 84])
        self.conv1 = nn.Conv2d(3, 6, 5)
        self.pool = nn.MaxPool2d(2, 2)
        self.conv2 = nn.Conv2d(6, 16, 5)
        self.fc1 = nn.Linear(16 * 5 * 5, 120)
        self.fc2 = nn.Linear(120, 84)
        # Projection head
        self.l1 = nn.Linear(84, 84)
        self.l2 = nn.Linear(84, out_dim)
        # Classifier
        self.l3 = nn.Linear(out_dim, num_classes)

    def forward(self, x):
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))
        x = x.view(-1, 16 * 5 * 5)
        x = F.relu(self.fc1(x))
        h = F.relu(self.fc2(x))
        z = self.l2(F.relu(self.l1(h)))
        return self.l3(z)


def get_model():
    return Net()
