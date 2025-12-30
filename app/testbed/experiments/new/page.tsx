"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import SingleFileUploader from "@/app/components/FileUploader";
import Dialog from "@/app/components/Dialog";
import Navigation from "@/app/components/Navigation";
import Footer from "@/app/components/Footer";

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

    const [isCreating, setIsCreating] = useState(false);

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
        if (!algorithmFile) {
            setDialog({
                isOpen: true,
                title: 'Missing Algorithm',
                message: 'Please select an algorithm file to continue.',
                type: 'warning',
            });
            return;
        }

        setIsCreating(true);
        try {
            // Upload all files first
            const algorithmPath = await uploadFile(algorithmFile, 'algorithm');
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
                    numClients,
                    numRounds,
                    clientFraction,
                    localEpochs,
                    learningRate,
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
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Framework
                                    </label>
                                    <select
                                        value={preset}
                                        onChange={(e) => setPreset(e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMS41TDYgNi41TDExIDEuNSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+')] bg-[right_0.75rem_center] bg-no-repeat"
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
                                        onChange={(e) => setNumClients(parseInt(e.target.value))}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                        onChange={(e) => setNumRounds(parseInt(e.target.value))}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                            className="flex-1"
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
                                        onChange={(e) => setLocalEpochs(parseInt(e.target.value))}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        min="1"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Learning Rate
                                    </label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={learningRate}
                                        onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        min="0"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Action Button */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Ready to Start?</h3>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {algorithmFile ? '✓ Algorithm selected' : '⚠ Select an algorithm to continue'}
                                    </p>
                                </div>
                                <button
                                    onClick={handleStartExperiment}
                                    disabled={isCreating || !algorithmFile}
                                    className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-indigo-600"
                                >
                                    {isCreating ? (
                                        <span className="flex items-center gap-2">
                                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
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
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Files</h2>
                            <div className="space-y-4">
                                {/* Algorithm - Required */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                            Algorithm <span className="text-red-500">*</span>
                                        </label>
                                        <span className="text-xs text-gray-500">.py</span>
                                    </div>
                                    <SingleFileUploader
                                        id="algorithm-uploader"
                                        accept=".py"
                                        hint="Drop algorithm file"
                                        type="algorithm"
                                        onFileSelect={setAlgorithmFile}
                                    />
                                </div>

                                {/* Model - Optional */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                            Model <span className="text-gray-400">(optional)</span>
                                        </label>
                                        <span className="text-xs text-gray-500">.pt, .pth</span>
                                    </div>
                                    <SingleFileUploader
                                        id="model-uploader"
                                        accept=".pt,.pth"
                                        hint="Drop model file"
                                        type="model"
                                        onFileSelect={setModelFile}
                                    />
                                </div>

                                {/* Config - Optional */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                            Configuration <span className="text-gray-400">(optional)</span>
                                        </label>
                                        <span className="text-xs text-gray-500">.py, .json, .yaml</span>
                                    </div>
                                    <SingleFileUploader
                                        id="config-uploader"
                                        accept=".py,.json,.yaml"
                                        hint="Drop config file"
                                        type="config"
                                        onFileSelect={setConfigFile}
                                    />
                                </div>

                                {/* Dataset - Optional */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-700">
                                            Dataset <span className="text-gray-400">(optional)</span>
                                        </label>
                                        <span className="text-xs text-gray-500">.py, .csv</span>
                                    </div>
                                    <SingleFileUploader
                                        id="dataset-uploader"
                                        accept=".py,.csv"
                                        hint="Drop dataset file"
                                        type="dataset"
                                        onFileSelect={setDatasetFile}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Quick Start Guide */}
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                            <h3 className="text-sm font-semibold text-blue-900 mb-2">Quick Start</h3>
                            <ol className="text-xs text-blue-800 space-y-1.5 list-decimal list-inside">
                                <li>Upload your FL algorithm (required)</li>
                                <li>Configure training parameters</li>
                                <li>Click "Start Experiment"</li>
                                <li>Monitor progress in real-time</li>
                            </ol>
                            <div className="mt-3 pt-3 border-t border-blue-200">
                                <p className="text-xs text-blue-700">
                                    <strong>Need an example?</strong><br/>
                                    Use <code className="bg-blue-100 px-1 rounded">examples/sample_algorithm.py</code>
                                </p>
                            </div>
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