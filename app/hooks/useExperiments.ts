"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiFetch, apiPost } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Experiment queries, shared by the dashboard, the list and the detail page.
 *
 * Because they share a cache key, a delete on the list page updates the
 * dashboard without either knowing about the other.
 */

export type Experiment = {
    id: string;
    name: string;
    description: string | null;
    status: string;
    framework: string;
    numClients: number;
    numRounds: number;
    clientFraction: number;
    localEpochs: number;
    learningRate: number;
    useGpu: boolean;
    cpusPerClient: number;
    gpuFractionPerClient: number;
    algorithmPath: string | null;
    modelPath: string | null;
    configPath: string | null;
    datasetPath: string | null;
    customConfig: {
        dataset?: { kind?: string };
        partitioner?: { kind?: string; alpha?: number };
        strategy?: { name?: string };
    } | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    finalAccuracy: number | null;
    finalLoss: number | null;
    errorMessage: string | null;
    logs: string | null;
};

export type Metric = {
    id: string;
    round: number;
    trainLoss: number | null;
    trainAccuracy: number | null;
    evalLoss: number | null;
    evalAccuracy: number | null;
    createdAt: string;
};

export type Checkpoint = {
    id: string;
    round: number;
    filePath: string;
    accuracy: number | null;
    loss: number | null;
    createdAt: string;
};

/** Anything not in a terminal state is worth polling for. */
const LIVE_POLL_MS = 5000;

export function useExperiments() {
    return useQuery({
        queryKey: queryKeys.experiments.list(),
        queryFn: () => apiFetch<{ experiments: Experiment[] }>("/api/experiments"),
        select: (data) => data.experiments,
        // Replaces the hand-rolled setInterval: this pauses while the tab is
        // hidden and never stacks overlapping requests.
        refetchInterval: LIVE_POLL_MS,
    });
}

export function useExperiment(id: string) {
    return useQuery({
        queryKey: queryKeys.experiments.detail(id),
        queryFn: () =>
            apiFetch<{ experiment: Experiment; metrics: Metric[]; checkpoints: Checkpoint[] }>(
                `/api/experiments/${id}`
            ),
        enabled: Boolean(id),
    });
}

export function useDeleteExperiment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/experiments/${id}`),
        onSuccess: (_result, id) => {
            queryClient.removeQueries({ queryKey: queryKeys.experiments.detail(id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.experiments.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.resources });
        },
    });
}

export function useStopExperiment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            apiPost<{ success: boolean; message: string }>(`/api/experiments/${id}/stop`),
        onSuccess: (_result, id) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.experiments.detail(id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.experiments.list() });
        },
    });
}

export function useStartExperiment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            apiPost<{ success: boolean; experimentId: string }>(`/api/experiments/${id}/start`),
        onSuccess: (_result, id) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.experiments.detail(id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.experiments.list() });
        },
    });
}

export type CreateExperimentInput = {
    /** Uploaded before the experiment exists, because it has no id to scope them to. */
    files: {
        algorithm: File | null;
        model: File | null;
        config: File | null;
        dataset: File | null;
    };
    body: Record<string, unknown>;
};

async function uploadFile(file: File, type: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    const { path } = await apiFetch<{ path: string }>("/api/upload", {
        method: "POST",
        body: formData,
    });

    return path;
}

/**
 * Upload the modules, create the experiment, then start it.
 *
 * All three steps are one mutation because a half-finished sequence is not a
 * state the user can do anything useful with -- a created-but-unstarted run
 * from a failed start is just litter.
 */
export function useCreateExperiment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ files, body }: CreateExperimentInput): Promise<Experiment> => {
            const [algorithmPath, modelPath, configPath, datasetPath] = await Promise.all([
                files.algorithm ? uploadFile(files.algorithm, "algorithm") : null,
                files.model ? uploadFile(files.model, "model") : null,
                files.config ? uploadFile(files.config, "config") : null,
                files.dataset ? uploadFile(files.dataset, "dataset") : null,
            ]);

            const { experiment } = await apiFetch<{ experiment: Experiment }>("/api/experiments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...body, algorithmPath, modelPath, configPath, datasetPath }),
            });

            await apiPost(`/api/experiments/${experiment.id}/start`);
            return experiment;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.experiments.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.resources });
        },
    });
}

export type SystemResources = {
    cpu: { count: number; ray_count: number };
    gpu: {
        available: boolean;
        count: number;
        devices: Array<{ id: number; name: string; memory_gb: number | null }>;
        backend: string | null;
    };
    concurrency: { max: number | null; active: number; available: number | null; canCreate: boolean };
};

export function useResources() {
    return useQuery({
        queryKey: queryKeys.resources,
        queryFn: () => apiFetch<SystemResources>("/api/resources"),
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });
}
