"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import Spinner from "./Spinner";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

/**
 * Four variants, deliberately.
 *
 * One primary per view, `secondary` for everything that sits beside it,
 * `ghost` for actions that live inside a row or a toolbar, and `danger`
 * reserved for the irreversible. Anything beyond these is a sign the page is
 * asking for too much at once.
 */
const VARIANTS: Record<Variant, string> = {
    primary:
        "bg-accent text-ink-inverted border border-accent hover:bg-accent-hover hover:border-accent-hover",
    secondary:
        "bg-surface text-ink border border-line-strong hover:bg-surface-hover",
    ghost:
        "bg-transparent text-ink-muted border border-transparent hover:bg-surface-hover hover:text-ink",
    danger:
        "bg-surface text-danger border border-danger-line hover:bg-danger-surface",
};

/**
 * Height, type and gap -- deliberately without padding.
 *
 * Padding and the icon-only square width are mutually exclusive, and Tailwind
 * resolves a conflict like `px-3.5 w-9 px-0` by stylesheet order rather than by
 * the order written in the class string. Emitting only the one that applies is
 * what makes the override actually take effect.
 */
const SIZES: Record<Size, string> = {
    sm: "h-8 text-xs gap-1.5",
    md: "h-9 text-sm gap-2",
};

const PADDING: Record<Size, string> = {
    sm: "px-2.5",
    md: "px-3.5",
};

/** An icon-only button is square, so it does not read as a cropped label. */
const SQUARE: Record<Size, string> = {
    sm: "w-8",
    md: "w-9",
};

const BASE =
    "inline-flex items-center justify-center rounded-[var(--radius)] font-medium " +
    "transition-colors select-none whitespace-nowrap " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
    "disabled:opacity-45 disabled:pointer-events-none";

type CommonProps = {
    variant?: Variant;
    size?: Size;
    icon?: IconName;
    /** Put the icon after the label -- for "next" and "open" style actions. */
    iconAfter?: boolean;
    /** Swaps the icon for a spinner and disables the control. */
    loading?: boolean;
    children?: ReactNode;
    className?: string;
};

type ButtonProps = CommonProps &
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

export default function Button({
    variant = "secondary",
    size = "md",
    icon,
    iconAfter,
    loading,
    children,
    className,
    disabled,
    ...rest
}: ButtonProps) {
    // With no label the glyph carries the whole meaning, so it is drawn a notch
    // larger than the same icon sitting beside text.
    const iconSize = children ? (size === "sm" ? 14 : 16) : size === "sm" ? 16 : 18;

    const glyph = loading ? (
        <Spinner size={iconSize} className="shrink-0" />
    ) : icon ? (
        <Icon name={icon} size={iconSize} className="shrink-0" />
    ) : null;

    return (
        <button
            className={cn(
                BASE,
                VARIANTS[variant],
                SIZES[size],
                children ? PADDING[size] : SQUARE[size],
                className
            )}
            disabled={disabled || loading}
            {...rest}
        >
            {!iconAfter && glyph}
            {children}
            {iconAfter && glyph}
        </button>
    );
}

type LinkButtonProps = CommonProps & { href: string; title?: string };

/** A link styled as a button, for navigation that should look like an action. */
export function LinkButton({
    href,
    variant = "secondary",
    size = "md",
    icon,
    iconAfter,
    children,
    className,
    title,
}: LinkButtonProps) {
    const iconSize = children ? (size === "sm" ? 14 : 16) : size === "sm" ? 16 : 18;
    const glyph = icon ? <Icon name={icon} size={iconSize} className="shrink-0" /> : null;

    return (
        <Link
            href={href}
            title={title}
            className={cn(
                BASE,
                VARIANTS[variant],
                SIZES[size],
                children ? PADDING[size] : SQUARE[size],
                className
            )}
        >
            {!iconAfter && glyph}
            {children}
            {iconAfter && glyph}
        </Link>
    );
}
