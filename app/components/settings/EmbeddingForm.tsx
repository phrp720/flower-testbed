"use client";

import { HINT_CLASS, INPUT_CLASS, LABEL_CLASS, PublicSettings } from "./types";

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
        <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900">Memory embeddings</h3>
            <p className="text-gray-600 text-sm mt-1 mb-6">
                Lets the agent recall earlier experiments and results by meaning rather than by
                keyword. Anthropic has no embeddings endpoint, so this is configured separately.
            </p>

            <label className="flex items-start gap-3 cursor-pointer mb-5">
                <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-800 focus:ring-gray-400"
                    checked={enabled}
                    onChange={(e) =>
                        onChange({ embeddingProvider: e.target.checked ? "openai-compatible" : "none" })
                    }
                />
                <span className="text-sm text-gray-700">
                    Enable semantic memory
                    <span className="block text-xs text-gray-500 mt-0.5">
                        When off, memory search falls back to full-text matching over stored
                        content. Nothing is lost, but recall is weaker.
                    </span>
                </span>
            </label>

            {enabled && (
                <div className="grid gap-5 border-t border-gray-100 pt-5">
                    <div>
                        <label className={LABEL_CLASS} htmlFor="embeddingBaseUrl">
                            Base URL
                        </label>
                        <input
                            id="embeddingBaseUrl"
                            type="url"
                            className={INPUT_CLASS}
                            placeholder="http://localhost:11434/v1"
                            value={settings.embeddingBaseUrl ?? ""}
                            onChange={(e) => onChange({ embeddingBaseUrl: e.target.value || null })}
                        />
                    </div>

                    <div>
                        <label className={LABEL_CLASS} htmlFor="embeddingApiKey">
                            API key <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                            id="embeddingApiKey"
                            type="password"
                            className={INPUT_CLASS}
                            placeholder={
                                settings.hasEmbeddingApiKey
                                    ? `Stored — ends in ${settings.embeddingApiKeyHint ?? "****"}`
                                    : "Often not needed for a local server"
                            }
                            value={embeddingApiKey}
                            onChange={(e) => onEmbeddingApiKeyChange(e.target.value)}
                            autoComplete="off"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={LABEL_CLASS} htmlFor="embeddingModel">
                                Model
                            </label>
                            <input
                                id="embeddingModel"
                                className={INPUT_CLASS}
                                placeholder="text-embedding-3-small"
                                value={settings.embeddingModel ?? ""}
                                onChange={(e) => onChange({ embeddingModel: e.target.value || null })}
                            />
                        </div>

                        <div>
                            <label className={LABEL_CLASS} htmlFor="embeddingDimensions">
                                Native dimensions
                            </label>
                            <input
                                id="embeddingDimensions"
                                type="number"
                                min={1}
                                className={INPUT_CLASS}
                                value={settings.embeddingDimensions}
                                onChange={(e) =>
                                    onChange({ embeddingDimensions: Number(e.target.value) })
                                }
                            />
                        </div>
                    </div>

                    <p className={HINT_CLASS}>
                        Vectors are stored at a fixed width of 1536. Narrower models are zero-padded,
                        which is exact for cosine similarity; wider ones are asked for 1536 directly
                        and truncated only if the server ignores that. Changing model later means
                        re-indexing, but never a database migration.
                    </p>
                </div>
            )}
        </div>
    );
}
