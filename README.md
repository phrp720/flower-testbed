<p align="center">
  <picture>
    <img src="public/testbed-icon-v2.png" alt="Flower Testbed" style="width:400px;height:200px;object-fit:contain;">
  </picture>
</p>

<p align="center">
A Testbed environment for testing <a href="https://flower.ai/docs/framework/index.html">Flower</a> federated learning algorithms that, when integrated into a potential application, will enable the management and monitoring of used models, algorithms, and metrics.   <br>
</p>


<details>
<summary>📑 Table of Contents</summary>

- [About](#about)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Project Structure](#project-structure)
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


## Project Structure

```
flower-testbed/
├── app/
│   ├── api/                    # API routes
│   │   ├── upload/            # File upload endpoint
│   │   └── experiments/       # Experiment CRUD & control
│   ├── components/            # React components
│   │   ├── FileUploader.tsx   # File upload with drag-drop
│   │   └── FileCard.tsx       # Card container
│   ├── testbed/
│   │   └── dashboard/         # Main dashboard page
│   └── layout.tsx
├── lib/
│   └── db/                    # Database layer
│       ├── schema.ts          # Drizzle schema
│       └── index.ts           # DB connection
├── uploads/                   # Uploaded files
│   ├── algorithms/
│   ├── models/
│   ├── datasets/
│   └── configs/
├── checkpoints/               # Model checkpoints per experiment
├── docker-compose.yml         # PostgreSQL container
└── drizzle.config.ts         # Drizzle configuration
```

## Roadmap
- [x] Database setup with PostgreSQL & Drizzle
- [x] File upload API
- [x] Experiment CRUD API
- [x] Dashboard UI with configuration
- [ ] Python runner for Flower experiments
- [ ] Dynamic experiment execution
- [ ] Real-time metrics collection
- [ ] Model checkpointing per round
- [ ] Real-time experiment monitoring page
- [ ] Metrics visualization (charts)
- [ ] Experiment history page
- [ ] Export results (CSV, JSON)
- [ ] Unit tests
- [ ] Sample applications
- [ ] User guide

## Contributing

This is a research project. Contributions, issues, and feature requests are welcome!

## License

This project is licensed under the **MIT license**.

See [LICENSE](https://github.com/phrp720/flower-testbed/blob/master/LICENSE) for more information.