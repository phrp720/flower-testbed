"use client";

import type {
    InputHTMLAttributes,
    ReactNode,
    SelectHTMLAttributes,
    TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { cn } from "./cn";

/**
 * One control surface, shared by every input, select and textarea.
 *
 * Defining it once is what keeps a text box and the select next to it exactly
 * the same height and weight -- the sort of thing that reads as sloppy when it
 * drifts and is invisible when it does not.
 */
export const CONTROL =
    "w-full rounded-[var(--radius)] border border-line-strong bg-surface text-ink " +
    "text-sm placeholder:text-ink-subtle transition-colors " +
    "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent " +
    "disabled:bg-surface-muted disabled:text-ink-subtle disabled:cursor-not-allowed";

const CONTROL_HEIGHT = "h-9 px-3";

/** Label, control, and the hint or error underneath it. */
export function Field({
    label,
    hint,
    error,
    htmlFor,
    children,
    className,
}: {
    label?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    htmlFor?: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("min-w-0", className)}>
            {label && (
                <label
                    htmlFor={htmlFor}
                    className="block text-xs font-medium text-ink-muted mb-1.5"
                >
                    {label}
                </label>
            )}
            {children}
            {/* An error replaces the hint rather than stacking on it, so the
                row never changes height when validation fires. */}
            {(error || hint) && (
                <p className={cn("text-xs mt-1.5", error ? "text-danger" : "text-ink-subtle")}>
                    {error || hint}
                </p>
            )}
        </div>
    );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
    label?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    wrapperClassName?: string;
};

export function Input({
    label,
    hint,
    error,
    className,
    wrapperClassName,
    id,
    ...rest
}: InputProps) {
    const generated = useId();
    const fieldId = id ?? generated;

    return (
        <Field label={label} hint={hint} error={error} htmlFor={fieldId} className={wrapperClassName}>
            <input
                id={fieldId}
                className={cn(CONTROL, CONTROL_HEIGHT, error && "border-danger-line", className)}
                {...rest}
            />
        </Field>
    );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
    label?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    wrapperClassName?: string;
};

export function Select({
    label,
    hint,
    error,
    className,
    wrapperClassName,
    id,
    children,
    ...rest
}: SelectProps) {
    const generated = useId();
    const fieldId = id ?? generated;

    return (
        <Field label={label} hint={hint} error={error} htmlFor={fieldId} className={wrapperClassName}>
            <select
                id={fieldId}
                className={cn(CONTROL, CONTROL_HEIGHT, "appearance-none pr-9", className)}
                {...rest}
            >
                {children}
            </select>
        </Field>
    );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    wrapperClassName?: string;
};

export function Textarea({
    label,
    hint,
    error,
    className,
    wrapperClassName,
    id,
    ...rest
}: TextareaProps) {
    const generated = useId();
    const fieldId = id ?? generated;

    return (
        <Field label={label} hint={hint} error={error} htmlFor={fieldId} className={wrapperClassName}>
            <textarea id={fieldId} className={cn(CONTROL, "py-2 px-3", className)} {...rest} />
        </Field>
    );
}

/** A checkbox with its label, aligned so the box sits on the first text line. */
export function Checkbox({
    label,
    hint,
    className,
    id,
    ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
    const generated = useId();
    const fieldId = id ?? generated;

    return (
        <div className={cn("flex items-start gap-2.5", className)}>
            <input
                id={fieldId}
                type="checkbox"
                className="mt-0.5 w-4 h-4 rounded border-line-strong text-accent focus:ring-2 focus:ring-ring"
                {...rest}
            />
            <label htmlFor={fieldId} className="min-w-0">
                <span className="block text-sm text-ink">{label}</span>
                {hint && <span className="block text-xs text-ink-subtle mt-0.5">{hint}</span>}
            </label>
        </div>
    );
}
