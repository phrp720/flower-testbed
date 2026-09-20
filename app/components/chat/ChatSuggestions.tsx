"use client";

import { Icon, type IconName } from "@/app/components/ui";

type Suggestion = { icon: IconName; label: string; prompt: string };

/**
 * Openers for an empty conversation.
 *
 * One per thing the agent can actually do -- read, analyse, compare, change --
 * so the set doubles as an answer to "what is this for?". The description used
 * to list examples in prose that could not be clicked, which is the worst of
 * both: it took the space of an affordance without being one.
 *
 * Picking one sends it. The full prompt is shown on the card rather than only
 * the short label, because a click spends tokens and starts real work -- the
 * "set up a new run" card creates and starts an experiment -- so what is about
 * to be sent has to be readable before the click, not after it.
 */
const WITH_EXPERIMENTS: Suggestion[] = [
    {
        icon: "experiments",
        label: "List my experiments",
        prompt: "List my experiments with their status and final accuracy.",
    },
    {
        icon: "metrics",
        label: "Which run did best?",
        prompt:
            "Which of my experiments reached the highest final accuracy, and what was different about its configuration?",
    },
    {
        icon: "network",
        label: "Explain my last run",
        prompt:
            "Summarise my most recent experiment: how it converged, whether it had plateaued by the end, and what you would change next.",
    },
    {
        icon: "add",
        label: "Set up a new run",
        prompt:
            "Create an experiment on the 2D circle dataset with 4 clients, 20 rounds and a 0.01 learning rate, then start it.",
    },
];

/** Nothing to analyse yet, so every opener has to be about getting started. */
const EMPTY: Suggestion[] = [
    {
        icon: "add",
        label: "Run my first experiment",
        prompt:
            "Create an experiment on the 2D circle dataset with 4 clients and 20 rounds, then start it.",
    },
    {
        icon: "docs",
        label: "How does this work?",
        prompt:
            "Explain how an experiment runs here: what the clients do each round, and how their updates become the global model.",
    },
    {
        icon: "tool",
        label: "What can you do?",
        prompt: "What can you do in this testbed? Group it by the kind of task.",
    },
];

export default function ChatSuggestions({
    hasExperiments,
    onPick,
}: {
    hasExperiments: boolean;
    onPick: (prompt: string) => void;
}) {
    const suggestions = hasExperiments ? WITH_EXPERIMENTS : EMPTY;

    return (
        <div className="max-w-xl mx-auto text-center py-12 px-4">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-surface-muted text-ink-subtle mb-3">
                <Icon name="sparkle" size={18} />
            </span>
            <p className="text-sm font-medium text-ink">Ask about your experiments</p>
            <p className="text-xs text-ink-muted mt-1">
                The agent can read your runs, compare them, inspect saved checkpoints and
                configure new ones.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 text-left">
                {suggestions.map((suggestion) => (
                    <button
                        key={suggestion.label}
                        type="button"
                        onClick={() => onPick(suggestion.prompt)}
                        title={suggestion.prompt}
                        className="flex items-start gap-2.5 p-3 rounded-[var(--radius)] border border-line hover:border-line-strong hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Icon
                            name={suggestion.icon}
                            size={14}
                            className="text-ink-subtle shrink-0 mt-0.5"
                        />
                        <span className="min-w-0">
                            <span className="block text-xs font-medium text-ink">
                                {suggestion.label}
                            </span>
                            <span className="text-[11px] text-ink-subtle mt-0.5 line-clamp-2">
                                {suggestion.prompt}
                            </span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
