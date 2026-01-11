<p align="center">
  <picture>
    <img src="public/flower-testbed-icon.png" alt="Flower Testbed" style="width:400px;height:auto;object-fit:contain;">
  </picture>
</p>

<p align="center">
A Testbed environment for testing <a href="https://flower.ai/docs/framework/index.html">Flower</a> federated learning algorithms that, when integrated into a potential application, will enable the management and monitoring of used models, algorithms, and metrics.   <br>
</p>


<details>
<summary>📑 Table of Contents</summary>

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
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

## Features

- ✅ **Web UI for Experiment Management**
  - File upload for algorithms, models, datasets, and configs
  - Configurable FL parameters (rounds, clients, learning rate, etc.)
  - Framework selection (PyTorch, TensorFlow, etc.)

- ✅ **Database-Backed Experiment Tracking**
  - PostgreSQL database with Drizzle ORM
  - Full experiment history
  - Per-round metrics storage
  - Model checkpoint management

- 🚧 **Flower Integration** (In Progress)
  - Dynamic experiment execution
  - Real-time metrics collection
  - Model checkpointing per round

- 🔜 **Monitoring Dashboard** (Planned)
  - Real-time experiment status
  - Metrics visualization
  - Client performance tracking

## Tech Stack

**Frontend:**
- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4

**Backend:**
- Next.js API Routes
- PostgreSQL (Docker)
- Drizzle ORM
- Python child processes for Flower experiments

**Federated Learning:**
- Flower Framework

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
   pnpm install
   ```

3. **Start PostgreSQL database**
   ```bash
   docker compose up -d
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local if needed (default config should work)
   ```

5. **Push database schema**
   ```bash
   pnpm db:push
   ```

6. **Start the development server**
   ```bash
   pnpm dev
   ```

7. **Open the dashboard**
   Navigate to [http://localhost:3000/testbed/dashboard](http://localhost:3000/testbed/dashboard)

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

### Example: Using the Flower Tutorial

See `/Users/phrp720/Desktop/FIT/yearProject/flower-tutorial` for a sample Flower project structure.

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

## API Documentation

### Upload File
```
POST /api/upload
Content-Type: multipart/form-data

Body:
  - file: File
  - type: 'algorithm' | 'model' | 'config' | 'dataset'

Response:
  {
    "success": true,
    "filename": "1234567890_file.py",
    "path": "uploads/algorithms/1234567890_file.py",
    "size": 12345,
    "type": "algorithm"
  }
```

### Create Experiment
```
POST /api/experiments
Content-Type: application/json

Body:
  {
    "name": "My Experiment",
    "description": "Description",
    "framework": "pytorch",
    "algorithmPath": "uploads/algorithms/...",
    "modelPath": "uploads/models/...",
    "configPath": "uploads/configs/...",
    "numClients": 10,
    "numRounds": 3,
    "clientFraction": 0.5,
    "localEpochs": 1,
    "learningRate": 0.01
  }

Response:
  {
    "experiment": { ...experiment object }
  }
```

### Start Experiment
```
POST /api/experiments/:id/start

Response:
  {
    "success": true,
    "message": "Experiment started",
    "experimentId": 1
  }
```

### Get Experiment Details
```
GET /api/experiments/:id

Response:
  {
    "experiment": { ...experiment object },
    "metrics": [ ...per-round metrics ],
    "checkpoints": [ ...model checkpoints ]
  }
```

## Database Schema

**experiments**: Experiment metadata and configuration
**metrics**: Per-round training metrics
**model_checkpoints**: Model states at each round
**clients**: Virtual client information

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

This project is open-source and available for research and educational purposes.