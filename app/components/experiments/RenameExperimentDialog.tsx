"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Callout, Field } from "@/app/components/ui";
import { useUpdateExperiment } from "@/app/hooks/useExperiments";

/**
 * Editing the two fields that are safe to change after a run.
 *
 * The name and the description are the only parts of an experiment that carry
 * no meaning for the runner, which is why they are editable at any status while
 * everything else is frozen once a run starts. They are also the parts you are
 * least able to get right in advance: the useful name for a run is usually
 * obvious only after you have seen what it did.
 */
export default function RenameExperimentDialog({
    experimentId,
    name,
    description,
    onClose,
}: {
    experimentId: string;
    name: string;
    description: string | null;
    onClose: () => void;
}) {
    const update = useUpdateExperiment(experimentId);
    const [draftName, setDraftName] = useState(name);
    const [draftDescription, setDraftDescription] = useState(description ?? "");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    useEffect(() => {
        const onEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onEscape);
        return () => document.removeEventListener("keydown", onEscape);
    }, [onClose]);

    const submit = () => {
        const trimmed = draftName.trim();
        if (!trimmed) {
            setError("Name is required.");
            return;
        }

        update.mutate(
            { name: trimmed, description: draftDescription.trim() || null },
            {
                onSuccess: onClose,
                onError: (e) =>
                    setError(e instanceof Error ? e.message : "Could not save those changes."),
            }
        );
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
                style={{ animation: "fadeIn 0.15s ease-out" }}
            />

            <div
                className="relative w-full max-w-md bg-surface border border-line rounded-[var(--radius)] shadow-lg p-5"
                style={{ animation: "scaleIn 0.15s ease-out" }}
                onClick={(event) => event.stopPropagation()}
            >
                <h2 className="text-sm font-semibold text-ink mb-4">Rename experiment</h2>

                {error && (
                    <Callout tone="danger" className="mb-4">
                        {error}
                    </Callout>
                )}

                <div className="space-y-4">
                    <Field label="Name">
                        <input
                            ref={inputRef}
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submit();
                            }}
                            className="w-full h-9 px-3 rounded-[var(--radius)] border border-line-strong bg-surface text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </Field>

                    <Field label="Description" hint="Optional.">
                        <textarea
                            value={draftDescription}
                            onChange={(e) => setDraftDescription(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 rounded-[var(--radius)] border border-line-strong bg-surface text-sm text-ink resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </Field>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                    <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={submit} loading={update.isPending}>
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
}
