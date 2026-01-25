"""
Custom Model Template for Flower Federated Learning

Instructions:
1. Define your model by implementing the Net class
2. Implement the forward() method
3. Optionally implement get_model() for custom initialization

The framework will look for:
- get_model() function (preferred) - should return a new model instance
- Net class (fallback) - will be instantiated directly
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class Net(nn.Module):
    """
    Custom neural network for federated learning.

    Modify this class to define your model architecture.
    """

    def __init__(self):
        super(Net, self).__init__()

        # Example: Simple CNN for image classification
        # Modify these layers for your use case

        # Convolutional layers
        self.conv1 = nn.Conv2d(3, 32, 3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, 3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)

        # Fully connected layers
        # Adjust input size based on your image dimensions and conv layers
        self.fc1 = nn.Linear(64 * 8 * 8, 512)
        self.fc2 = nn.Linear(512, 128)
        self.fc3 = nn.Linear(128, 10)  # 10 classes for CIFAR-10

        self.dropout = nn.Dropout(0.25)

    def forward(self, x):
        """
        Forward pass of the model.

        Args:
            x: Input tensor (batch of images)

        Returns:
            Output tensor (class logits)
        """
        # Convolutional layers
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))

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

    Use this function if you need custom initialization logic.

    Returns:
        A new model instance
    """
    model = Net()

    # Optional: Custom weight initialization
    # for m in model.modules():
    #     if isinstance(m, nn.Conv2d):
    #         nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
    #     elif isinstance(m, nn.Linear):
    #         nn.init.xavier_uniform_(m.weight)

    return model
