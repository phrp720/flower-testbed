"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SingleFileUploader from "@/app/components/FileUploader";
import Dialog from "@/app/components/Dialog";
import {
    Button,
    Callout,
    Card,
    CardHeader,
    Icon,
    Input,
    PageHeader,
    SectionLabel,
    Select,
    Spinner,
} from "@/app/components/ui";
import { useCreateExperiment, useResources } from "@/app/hooks/useExperiments";

interface SystemResources {
    cpu: { count: number; ray_count: number };
    gpu: {
        available: boolean;
        count: number;
        devices: Array<{ id: number; name: string; memory_gb: number | null }>;
        backend: string | null;
    };
    concurrency: {
        max: number | null;
        active: number;
        available: number | null;
        canCreate: boolean;
    };
}

// Template download links
const TEMPLATES = {
    model: '/api/templates/pytorch/model_template.py',
    dataset: '/api/templates/pytorch/dataset_template.py',
    strategy: '/api/templates/pytorch/strategy_template.py',
    config: '/api/templates/pytorch/config_template.py',
};

function downloadTemplate(template: keyof typeof TEMPLATES) {
    window.open(TEMPLATES[template], "_blank");
}

/**
 * One upload slot: label, template link, dropzone and its default.
 *
 * Declared here rather than inside the page. A component defined in a render
 * body is a new type on every render, so React unmounts and remounts its whole
 * subtree -- which threw away the dropzone's state the instant a file was
 * chosen, and made a successful upload look like nothing had happened.
 */
function UploadSlot({
    label,
    template,
    id,
    accept,
    hint,
    file,
    onSelect,
    fallback,
}: {
    label: string;
    template: keyof typeof TEMPLATES;
    id: string;
    accept: string;
    hint: string;
    file: File | null;
    onSelect: (file: File | null) => void;
    fallback?: string;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <SectionLabel>{label}</SectionLabel>
                <button
                    type="button"
                    onClick={() => downloadTemplate(template)}
                    className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink transition-colors"
                >
                    <Icon name="download" size={12} />
                    Template
                </button>
            </div>
            <SingleFileUploader
                id={id}
                accept={accept}
                hint={hint}
                file={file}
                onFileSelect={onSelect}
            />
            {fallback && <p className="text-[11px] text-ink-subtle mt-1.5">Default: {fallback}</p>}
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    /**
     * The only runner that exists.
     *
     * Kept as a disabled field rather than dropped: the experiment records a
     * framework, and showing which one is being used is more honest than
     * silently sending a value the form never mentions. It becomes a real
     * choice the moment a second runner ships.
     */
    const framework = "pytorch";
    /**
     * "" keeps the framework's own dataset (CIFAR-10 images). The other values
     * swap in a two-input dataset, which is the only kind whose input plane can
     * be drawn -- the federated learning itself is identical either way.
     */
    const [datasetKind, setDatasetKind] = useState("");

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
    const { data: resources = null, isLoading: loadingResources } = useResources();
    const createExperiment = useCreateExperiment();

    const isCreating = createExperiment.isPending;

    useEffect(() => {
        if (!resources) return;
        setCpusPerClient((current) => Math.min(current, resources.cpu.ray_count));
    }, [resources]);

    const concurrencyLimitReached = resources ? !resources.concurrency.canCreate : false;

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

    const handleStartExperiment = () => {
        createExperiment.mutate(
            {
                files: {
                    algorithm: algorithmFile,
                    model: modelFile,
                    config: configFile,
                    dataset: datasetFile,
                },
                body: {
                    name: experimentName || `Experiment - ${new Date().toLocaleString()}`,
                    description: `Federated Learning experiment using ${framework}`,
                    framework,
                    numClients,
                    numRounds,
                    clientFraction,
                    localEpochs,
                    learningRate,
                    useGpu,
                    cpusPerClient,
                    gpuFractionPerClient: useGpu ? gpuFractionPerClient : 0,
                    // Omitted entirely when no 2D dataset is chosen, so the run
                    // falls through to the framework default exactly as before.
                    ...(datasetKind
                        ? { customConfig: { dataset: { kind: datasetKind } } }
                        : {}),
                },
            },
            {
                onSuccess: (experiment) => router.push(`/testbed/experiments/${experiment.id}`),
                onError: (error) => setDialog({
                    isOpen: true,
                    title: 'Error',
                    message: `Failed to start experiment:\n${error instanceof Error ? error.message : 'Unknown error'}`,
                    type: 'error',
                }),
            }
        );
    };

    const maxCpusPerClient = resources?.cpu.ray_count || 8;

    return (
        <>
            <PageHeader
                title="New experiment"
                description="Configure a federation and launch it."
                backHref="/testbed/experiments"
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 space-y-5">
                    <Card>
                        <CardHeader title="Details" className="mb-5" />
                        <div className="space-y-4">
                            <Input
                                label="Name"
                                value={experimentName}
                                onChange={(e) => setExperimentName(e.target.value)}
                                placeholder={`Experiment - ${new Date().toLocaleDateString()}`}
                                hint="Left blank, it is named after the time it was created."
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Select
                                    label="Framework"
                                    value={framework}
                                    disabled
                                    hint="PyTorch is the only runner available."
                                >
                                    <option value="pytorch">PyTorch</option>
                                </Select>

                                <Select
                                    label="Dataset"
                                    value={datasetKind}
                                    onChange={(e) => setDatasetKind(e.target.value)}
                                    disabled={datasetFile !== null}
                                    hint={
                                        datasetFile !== null
                                            ? "Your uploaded dataset is used instead."
                                            : datasetKind
                                            ? "Two inputs, so the decision boundary can be drawn."
                                            : "Images; the run shows its learned filters."
                                    }
                                >
                                    <option value="">CIFAR-10 images</option>
                                    <option value="circle">2D · circle</option>
                                    <option value="spiral">2D · spiral</option>
                                    <option value="xor">2D · xor</option>
                                    <option value="gauss">2D · gauss</option>
                                </Select>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader title="Training" className="mb-5" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Clients"
                                type="number"
                                min={1}
                                value={numClients}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(value)) setNumClients(value);
                                }}
                            />
                            <Input
                                label="Rounds"
                                type="number"
                                min={1}
                                value={numRounds}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(value)) setNumRounds(value);
                                }}
                            />
                            <Input
                                label="Local epochs"
                                type="number"
                                min={1}
                                value={localEpochs}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(value)) setLocalEpochs(value);
                                }}
                            />
                            <Input
                                label="Learning rate"
                                type="number"
                                step="0.001"
                                min={0}
                                value={learningRate}
                                onChange={(e) => {
                                    const value = parseFloat(e.target.value);
                                    if (!Number.isNaN(value)) setLearningRate(value);
                                }}
                            />

                            <div className="sm:col-span-2">
                                <div className="flex items-baseline justify-between mb-2">
                                    <label
                                        htmlFor="client-fraction"
                                        className="text-xs font-medium text-ink-muted"
                                    >
                                        Client fraction
                                    </label>
                                    <span className="text-xs font-medium text-ink tabular">
                                        {(clientFraction * 100).toFixed(0)}% ·{" "}
                                        {Math.max(1, Math.round(numClients * clientFraction))} of{" "}
                                        {numClients} per round
                                    </span>
                                </div>
                                <input
                                    id="client-fraction"
                                    type="range"
                                    min="0.1"
                                    max="1"
                                    step="0.1"
                                    value={clientFraction}
                                    onChange={(e) => setClientFraction(parseFloat(e.target.value))}
                                    className="w-full accent-[var(--accent)]"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader
                            title="Resources"
                            description="What this machine can give each client."
                            className="mb-5"
                        />

                        {loadingResources ? (
                            <Spinner size={14} label="Detecting resources" />
                        ) : resources ? (
                            <>
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3 mb-5 rounded-[var(--radius)] bg-surface-muted">
                                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                                        <Icon name="cpu" size={14} />
                                        <span className="text-ink font-medium tabular">
                                            {resources.cpu.ray_count}
                                        </span>
                                        Ray CPUs
                                        <span className="text-ink-subtle">
                                            (host {resources.cpu.count})
                                        </span>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                                        <Icon name="gpu" size={14} />
                                        {resources.gpu.available ? (
                                            <>
                                                <span className="text-ink font-medium tabular">
                                                    {resources.gpu.count}
                                                </span>
                                                GPU
                                                <span className="text-ink-subtle">
                                                    ({resources.gpu.backend})
                                                </span>
                                            </>
                                        ) : (
                                            "No GPU"
                                        )}
                                    </span>
                                    {resources.concurrency.max !== null && (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                                            <Icon name="tasks" size={14} />
                                            <span className="text-ink font-medium tabular">
                                                {resources.concurrency.active}/{resources.concurrency.max}
                                            </span>
                                            slots busy
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <SectionLabel className="mb-2">Device</SectionLabel>
                                        <div className="flex items-center gap-4 h-9">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="device"
                                                    checked={!useGpu}
                                                    onChange={() => setUseGpu(false)}
                                                    className="w-4 h-4 accent-[var(--accent)]"
                                                />
                                                <span className="text-sm text-ink">CPU</span>
                                            </label>
                                            <label
                                                className={`flex items-center gap-2 ${
                                                    resources.gpu.available
                                                        ? "cursor-pointer"
                                                        : "cursor-not-allowed opacity-45"
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="device"
                                                    checked={useGpu}
                                                    disabled={!resources.gpu.available}
                                                    onChange={() => setUseGpu(true)}
                                                    className="w-4 h-4 accent-[var(--accent)]"
                                                />
                                                <span className="text-sm text-ink">GPU</span>
                                            </label>
                                        </div>
                                    </div>

                                    <Input
                                        label="CPUs per client"
                                        type="number"
                                        min={1}
                                        max={maxCpusPerClient}
                                        value={cpusPerClient}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value, 10);
                                            if (!Number.isNaN(value)) setCpusPerClient(value);
                                        }}
                                        hint={`Up to ${maxCpusPerClient} on this machine`}
                                    />

                                    {useGpu && resources.gpu.available && (
                                        <div className="sm:col-span-2">
                                            <div className="flex items-baseline justify-between mb-2">
                                                <label
                                                    htmlFor="gpu-fraction"
                                                    className="text-xs font-medium text-ink-muted"
                                                >
                                                    GPU fraction per client
                                                </label>
                                                <span className="text-xs font-medium text-ink tabular">
                                                    {(gpuFractionPerClient * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <input
                                                id="gpu-fraction"
                                                type="range"
                                                min="0.05"
                                                max="1"
                                                step="0.05"
                                                value={gpuFractionPerClient}
                                                onChange={(e) =>
                                                    setGpuFractionPerClient(parseFloat(e.target.value))
                                                }
                                                className="w-full accent-[var(--accent)]"
                                            />
                                            <p className="text-[11px] text-ink-subtle mt-1.5">
                                                {gpuFractionPerClient <= 0.5
                                                    ? `${Math.floor(1 / gpuFractionPerClient)} clients share each GPU`
                                                    : `Each client takes ${(gpuFractionPerClient * 100).toFixed(0)}% of a GPU`}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <Callout tone="warn">Could not detect this machine&apos;s resources.</Callout>
                        )}
                    </Card>

                    {concurrencyLimitReached && resources?.concurrency.max != null && (
                        <Callout tone="warn" title="All worker slots are busy">
                            {resources.concurrency.active} of {resources.concurrency.max} slots are in
                            use. A new experiment can start once one frees up.
                        </Callout>
                    )}

                    <div className="flex items-center justify-between gap-4 p-4 rounded-[var(--radius)] border border-line bg-surface-muted">
                        <p className="text-xs text-ink-muted">
                            {modelFile || datasetFile || algorithmFile
                                ? `Custom: ${[
                                      modelFile && "model",
                                      datasetFile && "dataset",
                                      algorithmFile && "strategy",
                                  ]
                                      .filter(Boolean)
                                      .join(", ")}`
                                : datasetKind
                                ? `Defaults with the ${datasetKind} dataset and FedAvg`
                                : "Defaults: CIFAR-10 CNN with FedAvg"}
                        </p>
                        <Button
                            variant="primary"
                            onClick={handleStartExperiment}
                            loading={isCreating}
                            disabled={concurrencyLimitReached}
                        >
                            {isCreating
                                ? "Creating"
                                : concurrencyLimitReached
                                ? "No slots available"
                                : "Start experiment"}
                        </Button>
                    </div>
                </div>

                <div className="space-y-5">
                    <Card>
                        <CardHeader
                            title="Files"
                            description="All optional -- defaults are used for anything you leave empty."
                            className="mb-5"
                        />
                        <div className="space-y-5">
                            <UploadSlot
                                label="Model"
                                template="model"
                                id="model-uploader"
                                file={modelFile}
                                accept=".py,.pt,.pth"
                                hint="model.py"
                                onSelect={setModelFile}
                                fallback="CIFAR-10 CNN"
                            />
                            <UploadSlot
                                label="Dataset"
                                template="dataset"
                                id="dataset-uploader"
                                file={datasetFile}
                                accept=".py"
                                hint="dataset.py"
                                onSelect={setDatasetFile}
                                fallback="CIFAR-10 (IID)"
                            />
                            <UploadSlot
                                label="Strategy"
                                template="strategy"
                                id="algorithm-uploader"
                                file={algorithmFile}
                                accept=".py"
                                hint="strategy.py"
                                onSelect={setAlgorithmFile}
                                fallback="FedAvg"
                            />
                            <UploadSlot
                                label="Config"
                                template="config"
                                id="config-uploader"
                                file={configFile}
                                accept=".py,.json,.yaml"
                                hint="config.py"
                                onSelect={setConfigFile}
                            />
                        </div>
                    </Card>
                </div>
            </div>

            <Dialog
                isOpen={dialog.isOpen}
                onClose={() => setDialog({ ...dialog, isOpen: false })}
                title={dialog.title}
                message={dialog.message}
                type={dialog.type}
            />
        </>
    );
}
