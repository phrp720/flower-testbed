"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Download, Info, Cpu, MonitorDot } from "lucide-react";
import SingleFileUploader from "@/app/components/FileUploader";
import Dialog from "@/app/components/Dialog";
import Navigation from "@/app/components/Navigation";
import Footer from "@/app/components/Footer";

interface SystemResources {
    cpu: { count: number };
    gpu: {
        available: boolean;
        count: number;
        devices: Array<{ id: number; name: string; memory_gb: number | null }>;
        backend: string | null;
    };
}

// Template download links
const TEMPLATES = {
    model: '/api/templates/pytorch/model_template.py',
    dataset: '/api/templates/pytorch/dataset_template.py',
    strategy: '/api/templates/pytorch/strategy_template.py',
    config: '/api/templates/pytorch/config_template.py',
};

export default function DashboardPage() {
    const router = useRouter();
    const [preset, setPreset] = useState("pytorch");

    // Track selected files (not uploaded yet)
    const [modelFile, setModelFile] = useState<File | null>(null);
    const [configFile, setConfigFile] = useState<File | null>(null);
    const [datasetFile, setDatasetFile] = useState<File | null>(null);
    const [algorithmFile, setAlgorithmFile] = useState<File | null>(null);

    // Experiment configuration
    const [experimentName, setExperimentName] = useState("");
    const [numClients, setNumClients] = useState(10);
    const [numRounds, setNumRounds] = useState(3);
    const [clientFraction, setClientFraction] = useState(0.5);
    const [localEpochs, setLocalEpochs] = useState(1);
    const [learningRate, setLearningRate] = useState(0.01);
    const [useGpu, setUseGpu] = useState(false);
    const [cpusPerClient, setCpusPerClient] = useState(1);
    const [gpuFractionPerClient, setGpuFractionPerClient] = useState(0.1);

    // System resources
    const [resources, setResources] = useState<SystemResources | null>(null);
    const [loadingResources, setLoadingResources] = useState(true);

    const [isCreating, setIsCreating] = useState(false);

    // Fetch available system resources on mount
    useEffect(() => {
        const fetchResources = async () => {
            try {
                const response = await fetch('/api/resources');
                if (response.ok) {
                    const data = await response.json();
                    setResources(data);

                }
            } catch (error) {
                console.error('Failed to fetch resources:', error);
            } finally {
                setLoadingResources(false);
            }
        };
        fetchResources();
    }, []);

    // Dialog state
    const [dialog, setDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'error' | 'success' | 'warning';
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
    });

    const uploadFile = async (file: File, type: string): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        const data = await response.json();
        return data.path;
    };

    const handleStartExperiment = async () => {
        setIsCreating(true);
        try {
            // Upload files if provided
            const algorithmPath = algorithmFile ? await uploadFile(algorithmFile, 'algorithm') : null;
            const modelPath = modelFile ? await uploadFile(modelFile, 'model') : null;
            const configPath = configFile ? await uploadFile(configFile, 'config') : null;
            const datasetPath = datasetFile ? await uploadFile(datasetFile, 'dataset') : null;

            // Create experiment with uploaded file paths
            const response = await fetch('/api/experiments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: experimentName || `Experiment - ${new Date().toLocaleString()}`,
                    description: `Federated Learning experiment using ${preset}`,
                    framework: preset,
                    algorithmPath,
                    modelPath,
                    configPath,
                    datasetPath,
                    numClients,
                    numRounds,
                    clientFraction,
                    localEpochs,
                    learningRate,
                    useGpu,
                    cpusPerClient,
                    gpuFractionPerClient: useGpu ? gpuFractionPerClient : 0,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to create experiment');
            }

            const { experiment } = await response.json();

            // Start the experiment
            const startResponse = await fetch(`/api/experiments/${experiment.id}/start`, {
                method: 'POST',
            });

            if (!startResponse.ok) {
                throw new Error('Failed to start experiment');
            }

            // Navigate to experiment monitoring page
            router.push(`/testbed/experiments/${experiment.id}`);
        } catch (error) {
            console.error('Error:', error);
            setDialog({
                isOpen: true,
                title: 'Error',
                message: `Failed to start experiment:\n${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            });
        } finally {
            setIsCreating(false);
        }
    };

    const downloadTemplate = (templateKey: keyof typeof TEMPLATES) => {
        window.open(TEMPLATES[templateKey], '_blank');
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4">
                {/* Header */}
                <div className="mb-8">
                    <Navigation />
                    <div className="mt-4">
                        <h2 className="text-2xl font-bold text-gray-900">Create New Experiment</h2>
                        <p className="text-gray-600 text-sm mt-1">Configure and launch a federated learning experiment</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Configuration */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Basic Info */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Experiment Details</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Experiment Name
                                    </label>
                                    <input
                                        type="text"
                                        value={experimentName}
                                        onChange={(e) => setExperimentName(e.target.value)}
                                        placeholder="My Federated Learning Experiment"
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Framework
                                    </label>
                                    <select
                                        value={preset}
                                        onChange={(e) => setPreset(e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMS41TDYgNi41TDExIDEuNSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+')] bg-[right_0.75rem_center] bg-no-repeat"
                                    >
                                        <option value="pytorch">PyTorch</option>
                                        <option value="tensorflow">TensorFlow</option>
                                        <option value="sklearn">scikit-learn</option>
                                        <option value="huggingface">Hugging Face</option>
                                        <option value="jax">JAX</option>
                                        <option value="mlx">MLX</option>
                                        <option value="numpy">NumPy</option>
                                        <option value="xgboost">XGBoost</option>
                                        <option value="flowertune">FlowerTune</option>
                                        <option value="flower-baseline">Flower Baseline</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Training Parameters */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Training Configuration</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Number of Clients
                                    </label>
                                    <input
                                        type="number"
                                        value={numClients}
                                        onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setNumClients(v); }}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Number of Rounds
                                    </label>
                                    <input
                                        type="number"
                                        value={numRounds}
                                        onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setNumRounds(v); }}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Client Fraction
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={clientFraction}
                                            onChange={(e) => setClientFraction(parseFloat(e.target.value))}
                                            className="flex-1 accent-gray-800"
                                        />
                                        <span className="text-sm font-medium text-gray-900 w-12 text-right">
                                            {(clientFraction * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Local Epochs
                                    </label>
                                    <input
                                        type="number"
                                        value={localEpochs}
                                        onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setLocalEpochs(v); }}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Learning Rate
                                    </label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={learningRate}
                                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setLearningRate(v); }}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                                        min="0"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Resource Configuration */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resource Configuration</h2>

                            {/* Available Resources Info */}
                            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                <h3 className="text-sm font-medium text-gray-700 mb-2">Available Resources</h3>
                                {loadingResources ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Detecting resources...
                                    </div>
                                ) : resources ? (
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div className="flex items-center gap-2">
                                            <Cpu className="w-4 h-4 text-gray-600" />
                                            <span className="text-gray-700">
                                                <strong>{resources.cpu.count}</strong> CPU cores
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <MonitorDot className="w-4 h-4 text-green-600" />
                                            {resources.gpu.available ? (
                                                <span className="text-gray-700">
                                                    <strong>{resources.gpu.count}</strong> GPU{resources.gpu.count > 1 ? 's' : ''}
                                                    <span className="text-gray-500 ml-1">({resources.gpu.backend})</span>
                                                </span>
                                            ) : (
                                                <span className="text-gray-500">No GPU available</span>
                                            )}
                                        </div>
                                        {resources.gpu.available && resources.gpu.devices.length > 0 && (
                                            <div className="col-span-2 text-xs text-gray-500 mt-1">
                                                {resources.gpu.devices.map(d => (
                                                    <div key={d.id}>
                                                        GPU {d.id}: {d.name} {d.memory_gb ? `(${d.memory_gb} GB)` : ''}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-sm text-gray-500">Could not detect resources</span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Compute Device Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Compute Device
                                    </label>
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="device"
                                                checked={!useGpu}
                                                onChange={() => setUseGpu(false)}
                                                className="w-4 h-4 accent-gray-800 focus:ring-gray-500"
                                            />
                                            <span className="text-sm text-gray-700">CPU</span>
                                        </label>
                                        <label className={`flex items-center gap-2 ${resources?.gpu.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                                            <input
                                                type="radio"
                                                name="device"
                                                checked={useGpu}
                                                onChange={() => setUseGpu(true)}
                                                disabled={!resources?.gpu.available}
                                                className="w-4 h-4 accent-gray-800 focus:ring-gray-500"
                                            />
                                            <span className="text-sm text-gray-700">GPU</span>
                                        </label>
                                    </div>
                                </div>

                                {/* CPUs per Client */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        CPUs per Client
                                    </label>
                                    <input
                                        type="number"
                                        value={cpusPerClient}
                                        onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1) setCpusPerClient(v); }}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                                        min="1"
                                        max={resources?.cpu.count || 8}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Max parallel clients: {resources ? Math.floor(resources.cpu.count / cpusPerClient) : '...'}
                                    </p>
                                </div>

                                {/* GPU Fraction per Client (only show if GPU enabled) */}
                                {useGpu && resources?.gpu.available && (
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            GPU Fraction per Client
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="range"
                                                min="0.05"
                                                max="1"
                                                step="0.05"
                                                value={gpuFractionPerClient}
                                                onChange={(e) => setGpuFractionPerClient(parseFloat(e.target.value))}
                                                className="flex-1 accent-gray-800"
                                            />
                                            <span className="text-sm font-medium text-gray-900 w-16 text-right">
                                                {(gpuFractionPerClient * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {gpuFractionPerClient <= 0.5
                                                ? `${Math.floor(1 / gpuFractionPerClient)} clients can share each GPU`
                                                : `Each client uses ${(gpuFractionPerClient * 100).toFixed(0)}% of a GPU`
                                            }
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Button */}
                        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Ready to Start?</h3>
                                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-gray-600" />
                                        {modelFile || datasetFile || algorithmFile
                                            ? `Custom files: ${[modelFile && 'model', datasetFile && 'dataset', algorithmFile && 'strategy'].filter(Boolean).join(', ')}`
                                            : 'Using defaults (CIFAR-10 CNN with FedAvg)'
                                        }
                                    </p>
                                </div>
                                <button
                                    onClick={handleStartExperiment}
                                    disabled={isCreating}
                                    className="bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isCreating ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="animate-spin h-5 w-5" />
                                            Creating...
                                        </span>
                                    ) : 'Start Experiment'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - File Uploads */}
                    <div className="space-y-4">
                        <div className="bg-white rounded-lg shadow p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-gray-900">Upload Files</h2>
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">All optional</span>
                            </div>
                            <div className="space-y-4">
                                {/* Model - Optional */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                            Model
                                        </label>
                                        <button
                                            onClick={() => downloadTemplate('model')}
                                            className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            Template
                                        </button>
                                    </div>
                                    <SingleFileUploader
                                        id="model-uploader"
                                        accept=".py,.pt,.pth"
                                        hint="Drop model.py file"
                                        type="model"
                                        onFileSelect={setModelFile}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Default: CIFAR-10 CNN</p>
                                </div>

                                {/* Dataset - Optional */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                            Dataset
                                        </label>
                                        <button
                                            onClick={() => downloadTemplate('dataset')}
                                            className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            Template
                                        </button>
                                    </div>
                                    <SingleFileUploader
                                        id="dataset-uploader"
                                        accept=".py"
                                        hint="Drop dataset.py file"
                                        type="dataset"
                                        onFileSelect={setDatasetFile}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Default: CIFAR-10 (IID)</p>
                                </div>

                                {/* Strategy/Algorithm - Optional */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                            Strategy
                                        </label>
                                        <button
                                            onClick={() => downloadTemplate('strategy')}
                                            className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            Template
                                        </button>
                                    </div>
                                    <SingleFileUploader
                                        id="algorithm-uploader"
                                        accept=".py"
                                        hint="Drop strategy.py file"
                                        type="algorithm"
                                        onFileSelect={setAlgorithmFile}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Default: FedAvg</p>
                                </div>

                                {/* Config - Optional */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                            Configuration
                                        </label>
                                        <button
                                            onClick={() => downloadTemplate('config')}
                                            className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            Template
                                        </button>
                                    </div>
                                    <SingleFileUploader
                                        id="config-uploader"
                                        accept=".py,.json,.yaml"
                                        hint="Drop config file"
                                        type="config"
                                        onFileSelect={setConfigFile}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Quick Start Guide */}
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                                <Info className="w-4 h-4" />
                                Quick Start
                            </h3>
                            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
                                <li>Configure training parameters</li>
                                <li>Optionally upload custom files</li>
                                <li>Click &quot;Start Experiment&quot;</li>
                                <li>Monitor progress in real-time</li>
                            </ol>
                        </div>
                    </div>
                </div>

                <Footer />
            </div>

            <Dialog
                isOpen={dialog.isOpen}
                onClose={() => setDialog({ ...dialog, isOpen: false })}
                title={dialog.title}
                message={dialog.message}
                type={dialog.type}
            />
        </div>
    );
}
