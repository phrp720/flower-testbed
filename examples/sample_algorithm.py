"""
Sample Federated Learning Algorithm for Flower Testbed
This is a simple example that users can upload to test the system.
"""

def get_strategy():
    """
    Returns a Flower strategy for federated learning.
    This is a placeholder that the testbed will use.
    """
    from flwr.server.strategy import FedAvg

    strategy = FedAvg(
        fraction_fit=0.5,  # Sample 50% of clients for training
        fraction_evaluate=0.5,  # Sample 50% of clients for evaluation
        min_fit_clients=2,
        min_evaluate_clients=2,
        min_available_clients=5,
    )

    return strategy


def train_client(model, train_loader, epochs, learning_rate, device):
    """
    Training function for a single client.
    Placeholder for demonstration.
    """
    import torch
    import torch.nn as nn

    model.train()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    criterion = nn.CrossEntropyLoss()

    for epoch in range(epochs):
        total_loss = 0.0
        for batch_idx, (data, target) in enumerate(train_loader):
            data, target = data.to(device), target.to(device)

            optimizer.zero_grad()
            output = model(data)
            loss = criterion(output, target)
            loss.backward()
            optimizer.step()

            total_loss += loss.item()

    avg_loss = total_loss / len(train_loader)
    return avg_loss


def evaluate_client(model, test_loader, device):
    """
    Evaluation function for a single client.
    Placeholder for demonstration.
    """
    import torch
    import torch.nn as nn

    model.eval()
    criterion = nn.CrossEntropyLoss()
    test_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for data, target in test_loader:
            data, target = data.to(device), target.to(device)
            output = model(data)
            test_loss += criterion(output, target).item()

            _, predicted = output.max(1)
            total += target.size(0)
            correct += predicted.eq(target).sum().item()

    avg_loss = test_loss / len(test_loader)
    accuracy = correct / total

    return avg_loss, accuracy


# Metadata for the testbed
ALGORITHM_INFO = {
    "name": "Sample FedAvg Algorithm",
    "description": "Basic Federated Averaging algorithm for testing",
    "version": "1.0.0",
    "author": "Flower Testbed",
}