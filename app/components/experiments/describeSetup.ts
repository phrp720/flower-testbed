/**
 * Saying what a run is actually made of.
 *
 * Partitioning, aggregation and the dataset are the three choices that change
 * an experiment most, and none of them is a column: they live in custom_config,
 * or inside an uploaded Python module, or nowhere at all because the defaults
 * were taken. The detail page rendered only the columns, so a run configured
 * through the agent -- or by uploading a dataset module that picks its own
 * split -- looked identical to a default one.
 *
 * The values preferred here are the ones the runner resolved at start-up and
 * wrote to custom_config.resolved. Those describe what ran. The configured
 * values are the fallback, used before a run has started and when an older run
 * predates this record, and they describe only what was asked for -- which is a
 * different thing whenever a module is uploaded or a strategy fails to load.
 */

export type ResolvedSetup = {
    strategy?: string | null;
    strategySource?: string | null;
    model?: string | null;
    dataset?: string | null;
    partitioner?: string | null;
    /** Classes the uploaded dataset module mentions; a static read, not a fact. */
    partitionerReferenced?: string[] | null;
};

export type SetupConfig = {
    dataset?: { kind?: string };
    partitioner?: {
        kind?: string;
        alpha?: number;
        num_shards_per_partition?: number;
        num_classes_per_partition?: number;
    };
    strategy?: { name?: string; params?: Record<string, unknown> };
    resolved?: ResolvedSetup;
} | null;

/** Which parameter is worth showing beside each partitioner. */
function partitionerDetail(p: NonNullable<SetupConfig>["partitioner"]): string | null {
    if (!p) return null;
    if (p.kind === "dirichlet" && p.alpha != null) return `\u03b1 ${p.alpha}`;
    if (p.kind === "shard" && p.num_shards_per_partition != null) {
        return `${p.num_shards_per_partition} shards each`;
    }
    if (p.kind === "pathological" && p.num_classes_per_partition != null) {
        return `${p.num_classes_per_partition} classes each`;
    }
    return null;
}

export function describePartitioning(config: SetupConfig, datasetPath: string | null): string {
    const resolved = config?.resolved;

    if (resolved) {
        if (resolved.partitioner) return resolved.partitioner;
        const referenced = resolved.partitionerReferenced;
        // Hedged deliberately: the module chooses its own split at call time and
        // a static read cannot see which branch it took.
        if (referenced?.length) return `${referenced.join(", ")} (from the module)`;
        if (datasetPath) return "defined in the dataset module";
    }

    // Not yet run. An uploaded module makes its own choice, so claiming the
    // platform default here would be a guess dressed as a fact.
    if (datasetPath) return "defined in the dataset module";

    const kind = config?.partitioner?.kind;
    if (!kind) return "iid (default)";

    const detail = partitionerDetail(config?.partitioner);
    return detail ? `${kind} \u00b7 ${detail}` : kind;
}

export function describeStrategy(config: SetupConfig, algorithmPath: string | null): string {
    const resolved = config?.resolved;

    if (resolved?.strategy) {
        // No "failed to load" case to report any more: create_strategy raises
        // rather than falling back, so a run that reaches the point of
        // recording a strategy is running the one that was asked for.
        return resolved.strategySource === "uploaded module"
            ? `${resolved.strategy} (uploaded)`
            : resolved.strategy;
    }

    if (algorithmPath) return "custom module";

    const name = config?.strategy?.name;
    if (!name) return "fedavg (default)";

    const params = config?.strategy?.params;
    const detail = params
        ? Object.entries(params)
              .map(([key, value]) => `${key} ${value}`)
              .join(", ")
        : "";
    return detail ? `${name} \u00b7 ${detail}` : name;
}

export function describeDataset(config: SetupConfig, datasetPath: string | null): string {
    const resolved = config?.resolved?.dataset;
    if (resolved === "uploaded module") return "custom module";
    if (resolved === "cifar10") return "CIFAR-10 (built-in)";
    if (resolved === "toy2d") {
        const kind = config?.dataset?.kind;
        return kind ? `${kind} (built-in 2D)` : "2D playground (built-in)";
    }

    if (datasetPath) return "custom module";
    const kind = config?.dataset?.kind;
    return kind ? `${kind} (built-in 2D)` : "CIFAR-10 (built-in)";
}

/** The model class the runner instantiated, when it recorded one. */
export function describeModel(config: SetupConfig, modelPath: string | null): string | null {
    const resolved = config?.resolved?.model;
    if (resolved) return modelPath ? `${resolved} (uploaded)` : resolved;
    return modelPath ? "custom module" : null;
}
