<p align="center">
  <picture>
    <img src="public/testbed-icon-v2.png" alt="Flower Testbed" style="width:400px;height:400px;object-fit:contain;">
  </picture>
</p>

<p align="center">
A Testbed Experiment Platform for testing <a href="https://flower.ai/docs/framework/index.html">Flower</a> federated learning algorithms.  <br>
</p>


<details>
<summary>📑 Table of Contents</summary>

- [About](#about)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Roadmap](#roadmap)

</details>

## About

Flower Testbed is an open-source platform for experimenting with federated learning algorithms using the [Flower framework](https://flower.ai/). It provides a comprehensive environment for testing, monitoring, and managing federated learning experiments across different computational resources.

### Key Capabilities

- **Algorithm Management**: Upload and test custom FL algorithms
- **Model Tracking**: Export model states at each federated round
- **Metrics Monitoring**: Real-time tracking of training metrics
- **Multi-Framework Support**: PyTorch, TensorFlow, sklearn, JAX, and more
- **Resource Flexibility**: CPU/GPU support with configurable client resources

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Docker & Docker Compose
- Python 3.9+ (for Flower experiments)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd flower-testbed
   ```

2. **Install dependencies**
   ```bash
   pnpm deps
   ```

3. **Start PostgreSQL database**
   ```bash
   docker compose up -d
   ```

4. **Push database schema**
   ```bash
   pnpm db:push
   ```

5. **Start the development server**
   ```bash
   pnpm dev
   ```

6. **Open the dashboard**

   Navigate to [http://localhost:3000/](http://localhost:3000/) in your web browser.

   The default credentials are `admin:admin`


## Usage

### Creating an Experiment

1. **Select Framework**: Choose your ML framework (PyTorch, TensorFlow, etc.)

2. **Upload Files**:
   - **Algorithm** (required): Your FL strategy implementation (.py)
   - **Model** (optional): Pre-trained model checkpoint (.pt, .pth)
   - **Config** (optional): Training configuration (.py, .json, .yaml)
   - **Dataset** (optional): Custom dataset implementation (.py, .csv)

3. **Configure Parameters**:
   - Number of clients
   - Number of rounds
   - Client fraction (% of clients per round)
   - Local epochs
   - Learning rate

4. **Start Experiment**: Click "Start Experiment" to begin

## Roadmap
- [x] Database setup with PostgreSQL & Drizzle
- [x] File upload API
- [x] Experiment CRUD API
- [x] Dashboard UI with configuration
- [x] Real-time experiment monitoring page
- [x] Metrics visualization (charts)
- [x] Experiment history page
- [x] Real-time metrics collection
- [x] Model checkpointing per round
- [ ] Python runner for Flower experiments - In Progress
- [ ] Dynamic experiment execution
- [ ] Export results (CSV, JSON) - Maybe
- [ ] User guide

## Contributing

This is a research project. Contributions, issues, and feature requests are welcome!

## License

This project is licensed under the **MIT license**.

See [LICENSE](https://github.com/phrp720/flower-testbed/blob/master/LICENSE) for more information.