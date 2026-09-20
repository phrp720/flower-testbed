"use client";

type Props = { diff: string };

/**
 * A unified diff. It is computed server-side and shipped as text, so the client
 * needs no diff library -- rendering is just colouring by line prefix.
 */
export default function DiffView({ diff }: Props) {
    return (
        <pre className="text-xs font-mono border border-gray-200 rounded overflow-x-auto max-h-80 bg-white">
            {diff.split("\n").map((line, i) => {
                const added = line.startsWith("+") && !line.startsWith("+++");
                const removed = line.startsWith("-") && !line.startsWith("---");
                const header = line.startsWith("+++") || line.startsWith("---");

                return (
                    <div
                        key={i}
                        className={`px-2 py-0.5 ${
                            added
                                ? "bg-green-50 text-green-900"
                                : removed
                                  ? "bg-red-50 text-red-900"
                                  : header
                                    ? "bg-gray-100 text-gray-600"
                                    : "text-gray-700"
                        }`}
                    >
                        {line || " "}
                    </div>
                );
            })}
        </pre>
    );
}
