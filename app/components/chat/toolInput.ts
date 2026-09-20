/**
 * Pulling the code out of a tool call's input.
 *
 * A file write arrives as JSON whose `contents` is the entire module on one
 * double-quoted line, every newline written out as \n. That is faithfully the
 * input and completely unreadable -- which matters, because the approval card
 * and the tool card are the only places the code the agent wrote can actually
 * be checked: by the person deciding whether to allow it, and by anyone
 * reviewing what already ran.
 *
 * Shared by both so the two views cannot drift into showing different things
 * about the same call.
 */

/** Input fields that hold source rather than a parameter. */
export const CODE_FIELDS: Record<string, string> = {
    contents: "Contents",
    source: "Source",
    oldString: "Replacing",
    newString: "With",
};

export type CodeSection = { key: string; label: string; text: string };

export function splitToolInput(input: unknown): { code: CodeSection[]; rest: unknown } {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
        return { code: [], rest: input };
    }

    const code: CodeSection[] = [];
    const rest: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (key in CODE_FIELDS && typeof value === "string") {
            code.push({ key, label: CODE_FIELDS[key], text: value });
        } else {
            rest[key] = value;
        }
    }

    return { code, rest: Object.keys(rest).length > 0 ? rest : null };
}
