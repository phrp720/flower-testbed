"use client";

import { Callout, Card, CardHeader, Checkbox, Input, Select, Textarea } from "@/app/components/ui";
import type { PublicSettings } from "./types";

type Props = {
    settings: PublicSettings;
    onChange: (patch: Partial<PublicSettings>) => void;
};

/** How the model reasons, and what it is told before the conversation starts. */
export default function BehaviourForm({ settings, onChange }: Props) {
    const isAnthropic = settings.provider === "anthropic";

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader
                    title="Reasoning"
                    description="How hard the model works before it answers."
                    className="mb-5"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                        label="Effort"
                        value={settings.effort}
                        onChange={(e) =>
                            onChange({ effort: e.target.value as PublicSettings["effort"] })
                        }
                        hint={
                            isAnthropic
                                ? "Higher deliberates longer and costs more."
                                : "Anthropic only; ignored by OpenAI-compatible servers."
                        }
                    >
                        {(["low", "medium", "high", "xhigh", "max"] as const).map((level) => (
                            <option key={level} value={level}>
                                {level}
                            </option>
                        ))}
                    </Select>

                    <Input
                        label="Temperature (optional)"
                        type="number"
                        step="0.1"
                        min={0}
                        max={2}
                        placeholder="provider default"
                        value={settings.temperature ?? ""}
                        onChange={(e) =>
                            onChange({
                                temperature: e.target.value === "" ? null : Number(e.target.value),
                            })
                        }
                        hint={
                            isAnthropic
                                ? "Dropped automatically for Claude models that reject it."
                                : "Passed straight through to your server."
                        }
                    />
                </div>

                <div className="border-t border-line pt-4 mt-4">
                    <Checkbox
                        label="Disable parallel tool calls"
                        hint="Forces one tool call per turn. Useful for smaller local models that mishandle several at once."
                        checked={settings.disableParallelToolCalls}
                        onChange={(e) => onChange({ disableParallelToolCalls: e.target.checked })}
                    />
                </div>
            </Card>

            <Card>
                <CardHeader
                    title="Approvals"
                    description="Actions that change experiments or write files are held for you to approve."
                    className="mb-5"
                />

                <Checkbox
                    label="Approve agent actions automatically"
                    hint="New conversations skip the approval step. Existing ones keep whatever they were set to, and any conversation can still be switched either way from its header."
                    checked={settings.defaultAutoRun}
                    onChange={(e) => onChange({ defaultAutoRun: e.target.checked })}
                />

                {settings.defaultAutoRun && (
                    <Callout tone="warn" className="mt-4">
                        New conversations will start, stop and delete experiments and write
                        files without asking first.
                    </Callout>
                )}
            </Card>

            <Card>
                <CardHeader
                    title="System prompt"
                    description="Replaces the built-in instructions the agent is given."
                    className="mb-5"
                />

                <Textarea
                    rows={8}
                    value={settings.systemPromptOverride ?? ""}
                    onChange={(e) => onChange({ systemPromptOverride: e.target.value || null })}
                    placeholder="Leave empty to use the built-in prompt."
                    className="font-mono text-xs leading-relaxed"
                    hint="The built-in prompt is what teaches the agent about federated learning, this testbed's tools and the approval rules. An override replaces it entirely, so the agent may stop using tools correctly. Leave it empty unless you are deliberately experimenting."
                />
            </Card>
        </div>
    );
}
