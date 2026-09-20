"use client";

import { Card, CardHeader, Icon, LinkButton } from "@/app/components/ui";

/**
 * The four Python modules an experiment runs, with a way to get them back.
 *
 * They used to exist only on disk. That was survivable while every module came
 * through the upload form -- whoever uploaded one still had it -- but the agent
 * writes them now, and a file you cannot read, copy or reuse is not really in
 * your hands. Reproducing a run, or basing the next one on it, starts here.
 */

type Module = {
    type: "algorithm" | "model" | "config" | "dataset";
    label: string;
    /** The stored path, whose basename is the filename a person recognises. */
    path: string | null;
};

/** Everything after the last separator, for a path in either convention. */
function basename(value: string): string {
    return value.split(/[\\/]/).pop() || value;
}

export default function ModulesCard({
    experimentId,
    algorithmPath,
    modelPath,
    configPath,
    datasetPath,
}: {
    experimentId: string;
    algorithmPath: string | null;
    modelPath: string | null;
    configPath: string | null;
    datasetPath: string | null;
}) {
    const modules: Module[] = [
        { type: "model", label: "Model", path: modelPath },
        { type: "dataset", label: "Dataset", path: datasetPath },
        { type: "algorithm", label: "Strategy", path: algorithmPath },
        { type: "config", label: "Config", path: configPath },
    ];

    const present = modules.filter((module) => module.path);

    // Nothing uploaded means the run used the built-in defaults, and an empty
    // card saying so is a row of nothing. The Configuration card above already
    // describes what it ran.
    if (present.length === 0) return null;

    return (
        <Card className="mb-5">
            <CardHeader
                title="Modules"
                description="The Python this run loaded. Download one to reuse or adapt it."
                className="mb-4"
            />

            <ul className="divide-y divide-line">
                {present.map((module) => {
                    const href = `/api/experiments/${experimentId}/files/${module.type}`;
                    return (
                        <li key={module.type} className="flex items-center gap-3 py-2.5 first:pt-0">
                            <Icon name="logs" size={15} className="text-ink-subtle shrink-0" />

                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-ink truncate">
                                    {basename(module.path as string)}
                                </p>
                                <p className="text-xs text-ink-muted">{module.label}</p>
                            </div>

                            {/* Viewing is the common case -- most of these are a
                                screen of Python -- so it comes first, and the
                                download is for taking it somewhere. */}
                            <LinkButton
                                href={`${href}?inline=1`}
                                target="_blank"
                                size="sm"
                                variant="ghost"
                                icon="view"
                            >
                                View
                            </LinkButton>
                            <LinkButton
                                href={href}
                                external
                                size="sm"
                                variant="secondary"
                                icon="download"
                            >
                                Download
                            </LinkButton>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
}
