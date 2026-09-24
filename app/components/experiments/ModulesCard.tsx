"use client";

import { Card, CardHeader, Icon, LinkButton, cn } from "@/app/components/ui";

/**
 * The four Python modules an experiment runs, with a way to get them back.
 *
 * Every slot is listed, uploaded or not. An empty slot does not mean no code
 * ran -- it means the platform's own module ran -- and hiding that made a
 * default run look like it had no implementation, which is the opposite of
 * true. Showing all four is what makes a run reproducible from its own page:
 * read exactly what trained, or take it as the starting point for the next one.
 *
 * The one honest gap is the default strategy. It is a FedAvg instance built in
 * server.py rather than a module, so there is no file that would be the right
 * answer, and the row says so instead of linking to something that only
 * resembles it.
 */

type Slot = {
    type: "algorithm" | "model" | "config" | "dataset";
    label: string;
    /** The uploaded path, when there is one. */
    path: string | null;
    /** What ran instead, when there is not. */
    fallback: string;
    /** Whether that fallback is a file this platform can show. */
    viewable: boolean;
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
    datasetKind,
}: {
    experimentId: string;
    algorithmPath: string | null;
    modelPath: string | null;
    configPath: string | null;
    datasetPath: string | null;
    /** Set when a built-in 2D dataset was chosen, which swaps the module out. */
    datasetKind?: string | null;
}) {
    const slots: Slot[] = [
        { type: "model", label: "Model", path: modelPath, fallback: "built-in CIFAR-10 CNN", viewable: true },
        {
            type: "dataset",
            label: "Dataset",
            path: datasetPath,
            fallback: datasetKind ? `built-in 2D (${datasetKind})` : "built-in CIFAR-10 loader",
            viewable: true,
        },
        {
            type: "algorithm",
            label: "Strategy",
            path: algorithmPath,
            fallback: "built-in FedAvg \u2014 constructed in code, no module",
            viewable: false,
        },
        { type: "config", label: "Config", path: configPath, fallback: "built-in defaults", viewable: true },
    ];

    return (
        <Card className="mb-5">
            <CardHeader
                title="Modules"
                description="Every module this run loaded, including the platform defaults. Download one to reuse or adapt it."
                className="mb-4"
            />

            <ul className="divide-y divide-line">
                {slots.map((slot) => {
                    const href = `/api/experiments/${experimentId}/files/${slot.type}`;
                    const uploaded = Boolean(slot.path);
                    const readable = uploaded || slot.viewable;

                    return (
                        <li key={slot.type} className="flex items-center gap-3 py-2.5 first:pt-0">
                            <Icon
                                name="logs"
                                size={15}
                                className={cn("shrink-0", uploaded ? "text-ink-subtle" : "text-ink-subtle/50")}
                            />

                            <div className="min-w-0 flex-1">
                                <p
                                    className={cn(
                                        "truncate text-sm",
                                        uploaded ? "text-ink" : "text-ink-muted"
                                    )}
                                >
                                    {uploaded ? basename(slot.path as string) : slot.fallback}
                                </p>
                                <p className="text-xs text-ink-muted">
                                    {slot.label}
                                    {!uploaded && " \u00b7 default"}
                                </p>
                            </div>

                            {/* Viewing is the common case -- most of these are a
                                screen of Python -- so it comes first, and the
                                download is for taking it somewhere. */}
                            {readable ? (
                                <>
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
                                </>
                            ) : (
                                <span className="text-xs text-ink-subtle shrink-0">no file</span>
                            )}
                        </li>
                    );
                })}
            </ul>

        </Card>
    );
}
