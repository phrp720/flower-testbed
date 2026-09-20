"use client";

import { Card, CardHeader, Checkbox, Input } from "@/app/components/ui";
import type { PublicSettings } from "./types";

type Props = {
    settings: PublicSettings;
    embeddingApiKey: string;
    onChange: (patch: Partial<PublicSettings>) => void;
    onEmbeddingApiKeyChange: (value: string) => void;
};

export default function EmbeddingForm({
    settings,
    embeddingApiKey,
    onChange,
    onEmbeddingApiKeyChange,
}: Props) {
    const enabled = settings.embeddingProvider !== "none";

    return (
        <Card>
            <CardHeader
                title="Memory embeddings"
                description="Lets the agent recall earlier experiments by meaning rather than keyword. Anthropic has no embeddings endpoint, so this is configured separately."
                className="mb-5"
            />

            <Checkbox
                label="Enable semantic memory"
                hint="When off, memory search falls back to full-text matching. Nothing is lost, but recall is weaker."
                checked={enabled}
                onChange={(e) =>
                    onChange({ embeddingProvider: e.target.checked ? "openai-compatible" : "none" })
                }
            />

            {enabled && (
                <div className="space-y-4 border-t border-line pt-5 mt-5">
                    <Input
                        label="Base URL"
                        type="url"
                        placeholder="http://localhost:11434/v1"
                        value={settings.embeddingBaseUrl ?? ""}
                        onChange={(e) => onChange({ embeddingBaseUrl: e.target.value || null })}
                    />

                    <Input
                        label="API key (optional)"
                        type="password"
                        autoComplete="off"
                        placeholder={
                            settings.hasEmbeddingApiKey
                                ? `Stored — ends in ${settings.embeddingApiKeyHint ?? "****"}`
                                : "Often not needed for a local server"
                        }
                        value={embeddingApiKey}
                        onChange={(e) => onEmbeddingApiKeyChange(e.target.value)}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                            label="Model"
                            placeholder="text-embedding-3-small"
                            value={settings.embeddingModel ?? ""}
                            onChange={(e) => onChange({ embeddingModel: e.target.value || null })}
                        />
                        <Input
                            label="Native dimensions"
                            type="number"
                            min={1}
                            value={settings.embeddingDimensions}
                            onChange={(e) => onChange({ embeddingDimensions: Number(e.target.value) })}
                        />
                    </div>

                    <p className="text-xs text-ink-subtle">
                        Vectors are stored at a fixed width of 1536. Narrower models are zero-padded,
                        which is exact for cosine similarity; wider ones are asked for 1536 directly
                        and truncated only if the server ignores that. Changing model later means
                        re-indexing, never a database migration.
                    </p>
                </div>
            )}
        </Card>
    );
}
