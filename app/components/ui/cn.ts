/**
 * Join class names, keeping only the truthy strings.
 *
 * Callers routinely write `someNode && "a-class"`, and a ReactNode guard can be
 * `0` or `""` as easily as `false`, so the input type is deliberately loose and
 * the filter does the narrowing. Every component takes a `className` that is
 * appended last, so a caller can override a default without a dedicated prop.
 */
type ClassValue = string | number | bigint | boolean | null | undefined;

export function cn(...parts: ClassValue[]): string {
    return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
}
