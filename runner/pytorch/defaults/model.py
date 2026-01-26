"""
Default CNN model for CIFAR-10.

This model is used when no custom model is provided.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class Net(nn.Module):
    """
    Simple CNN for CIFAR-10 classification.

    Architecture:
    - 2 convolutional layers with max pooling
    - 3 fully connected layers
    - Output: 10 classes
    """

    def __init__(self):
        super(Net, self).__init__()

        # Convolutional layers
        self.conv1 = nn.Conv2d(3, 32, 3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, 3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)

        # Fully connected layers
        # After 2 pooling layers: 32x32 -> 16x16 -> 8x8
        self.fc1 = nn.Linear(64 * 8 * 8, 512)
        self.fc2 = nn.Linear(512, 128)
        self.fc3 = nn.Linear(128, 10)

        # Dropout for regularization
        self.dropout = nn.Dropout(0.25)

    def forward(self, x):
        # Convolutional layers with ReLU and pooling
        x = self.pool(F.relu(self.conv1(x)))  # 32x32 -> 16x16
        x = self.pool(F.relu(self.conv2(x)))  # 16x16 -> 8x8

        # Flatten
        x = x.view(-1, 64 * 8 * 8)

        # Fully connected layers
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = F.relu(self.fc2(x))
        x = self.dropout(x)
        x = self.fc3(x)

        return x


def get_model() -> nn.Module:
    """
    Factory function to create a new model instance.

    Returns:
        A new Net model instance
    """
    return Net()
