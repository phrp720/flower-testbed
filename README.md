<p align="center">
  <picture>
    <img src="public/testbed-icon-v2.png" alt="Flower Testbed" style="width:400px;height:400px;object-fit:contain;">
  </picture>
</p>

<p align="center">
A Testbed Experiment Platform for testing <a href="https://flower.ai/docs/framework/index.html">Flower</a> federated learning algorithms.  <br>
</p>

<p align="center">

  <a href="https://github.com/phrp720/flower-testbed/actions/workflows/docker-image.yml">
    <img title="Docker Build" src="https://github.com/phrp720/flower-testbed/actions/workflows/docker-image.yml/badge.svg" alt="docker build">
  </a>

  <a href="https://github.com/phrp720/flower-testbed/actions/workflows/release.yml">
    <img title="Package Release" src="https://github.com/phrp720/flower-testbed/actions/workflows/release.yml/badge.svg" alt="package release">
  </a>

  <a href="https://github.com/phrp720/flower-testbed/releases">
    <img title="Latest release" src="https://img.shields.io/github/v/release/phrp720/flower-testbed" alt="Latest release">
  </a>
</p>

<details>
<summary>📑 Table of Contents</summary>

- [About](#about)
- [Getting Started](#getting-started)
  - [Installation](#installation)
    - [Development Setup](#development-setup)
      - [Prerequisites](#prerequisites)
    - [Production Setup](#production-setup)
- [Usage](#usage)
- [GitHub Action](#github-action)
- [Contributing](#contributing)
- [License](#license)

</details>

## About

Flower Testbed is an open-source platform for experimenting with federated learning algorithms using the [Flower framework](https://flower.ai/). It provides a comprehensive environment for testing, monitoring, and managing federated learning experiments across different computational resources.

### Key Capabilities

- **Algorithm Management**: Upload and test custom FL algorithms
- **Model Tracking**: Export model states at each federated round
- **Metrics Monitoring**: Real-time tracking of training metrics
- **Resource Flexibility**: CPU/GPU support with configurable client resources

## Getting Started


### Installation

#### Development Setup

##### Prerequisites

- Node.js 20+
- pnpm
- Docker & Docker Compose
- Python 3.9+ (for Flower experiments)

Steps: 
1. **Clone the repository**
   ```bash
   git clone https://github.com/phrp720/flower-testbed.git
   cd flower-testbed
   ```

2. **Install dependencies**
   ```bash
   pnpm deps
   ```

3. **Copy environment configuration**
   ```bash
   cp .env.example .env
   ```

4. **Start PostgreSQL database**
   ```bash
   docker compose -f deployments/development/docker-compose.yml up -d
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

   Navigate to [http://localhost:3000/](http://localhost:3000/) in your web browser.

   The default credentials are `admin:admin`

#### Production Setup

1. For each release, a `deployment.zip` file is provided.You can find it in the [Releases](https://github.com/phrp720/flower-testbed/releases)

   This archive contains everything required to deploy the application, including:

   * The Flower application
   * PostgreSQL
   * An `.env.example` example file for configuration

2. Download and unzip the `deployment.zip` file.

3. Open the `.env.example` file, update the configuration values as needed and rename it to `.env`.

4. Start the application using Docker Compose:

   ```bash
   docker compose up -d
   ```

## Usage

### Creating an Experiment

1. **Select Framework**: Choose your ML framework (PyTorch, TensorFlow, etc.)

2. **Upload Files**:
   - **Algorithm** (required): Your FL strategy implementation (.py)
   - **Model** (optional): Model definition (.py)
   - **Config** (optional): Training configuration (.py, .json, .yaml)
   - **Dataset** (optional): Custom dataset implementation (.py, .csv)

3. **Configure Parameters**:
   - Number of clients
   - Number of rounds
   - Client fraction (% of clients per round)
   - Local epochs
   - Learning rate

4. **Start Experiment**: Click "Start Experiment" to begin

> [!TIP]
> You can download templates for Algorithm, Config,Strategy and  Dataset files to get started quickly.

> [!NOTE]
> The application supports only Pytorch for now. Support for TensorFlow is coming soon.

## GitHub Action

The `gh-action/` directory contains a reusable GitHub Action that lets any repository trigger a simulation on a running Flower Testbed instance whenever files are pushed to a designated folder.

### Quick Start

1. **Add secrets** to your repository (`Settings → Secrets and variables → Actions`):

   | Secret | Description |
   | --- | --- |
   | `TESTBED_URL` | URL of your testbed instance (must be `https://`) |
   | `TESTBED_USERNAME` | Login username |
   | `TESTBED_PASSWORD` | Login password |

2. **Create a simulation folder** in your repo (default: `flower-simulation/`) and add your files following the naming convention:

   | File pattern | Type |
   | --- | --- |
   | `strategy*.py` | FL strategy implementation |
   | `model*.py` | Model definition |
   | `config*.py` / `config*.json` / `config*.yaml` | Training configuration |
   | `dataset*.py` | Custom dataset loader |

3. **Add the workflow** — copy [`gh-action/examples/workflow.yml`](gh-action/examples/workflow.yml) to `.github/workflows/flower-simulation.yml` in your repo:

   ```yaml
   on:
     push:
       paths:
         - 'flower-simulation/**'

   jobs:
     simulate:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: phrp720/flower-testbed/gh-action@main
           with:
             testbed_url:      ${{ secrets.TESTBED_URL }}
             testbed_username: ${{ secrets.TESTBED_USERNAME }}
             testbed_password: ${{ secrets.TESTBED_PASSWORD }}
             num_rounds:       '5'
   ```

4. **Push** — every push touching `flower-simulation/` will trigger a new experiment automatically.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `testbed_url` | — | Testbed instance URL **(required)** |
| `testbed_username` | — | Auth username **(required)** |
| `testbed_password` | — | Auth password **(required)** |
| `simulation_folder` | `flower-simulation` | Folder to scan for simulation files |
| `experiment_name` | `<repo>@<sha>` | Optional base name for the experiment. When set, the action uses `<experiment_name>-<shortSHA>` |
| `framework` | `pytorch` | ML framework |
| `num_clients` | `10` | Number of federated clients |
| `num_rounds` | `3` | Number of federated rounds |
| `client_fraction` | `0.5` | Fraction of clients selected per round |
| `local_epochs` | `1` | Local training epochs per client |
| `learning_rate` | `0.01` | Client optimizer learning rate |
| `wait_for_completion` | `false` | Block the job until the experiment finishes |
| `timeout_minutes` | `60` | Max wait time when `wait_for_completion` is true |

### Outputs

| Output | Description |
| --- | --- |
| `experiment_id` | ID of the created experiment |
| `experiment_url` | Direct link to the experiment on the dashboard |
| `status` | Final status: `pending` / `running` / `completed` / `failed` |
| `final_accuracy` | Final accuracy (set only when `wait_for_completion: true`) |
| `final_loss` | Final loss (set only when `wait_for_completion: true`) |

## Contributing

This is a research project. Contributions, issues, and feature requests are welcome!

## License

This project is licensed under the **MIT license**.

See [LICENSE](https://github.com/phrp720/flower-testbed/blob/master/LICENSE) for more information.
