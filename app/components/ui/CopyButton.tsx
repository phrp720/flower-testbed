"use client";

import { useEffect, useState } from "react";
import Button from "./Button";

type Props = {
    /** The exact text placed on the clipboard. */
    value: string;
    /** Omit for an icon-only button. */
    label?: string;
    size?: "sm" | "md";
    variant?: "primary" | "secondary" | "ghost" | "danger";
    className?: string;
    title?: string;
};

/**
 * Copy-to-clipboard with its own confirmation.
 *
 * The icon swap is the whole point: the clipboard gives no visible sign that
 * anything happened, so without it the button looks broken on a fast click.
 * Three places had grown their own copy of this state and timer.
 */
export default function CopyButton({
    value,
    label,
    size = "sm",
    variant = "ghost",
    className,
    title,
}: Props) {
    const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

    useEffect(() => {
        if (state === "idle") return;
        const timer = setTimeout(() => setState("idle"), 2000);
        return () => clearTimeout(timer);
    }, [state]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setState("copied");
        } catch {
            // Denied permission or an insecure context. Saying so beats a
            // button that silently does nothing.
            setState("failed");
        }
    };

    return (
        <Button
            size={size}
            variant={variant}
            className={className}
            title={title ?? "Copy"}
            aria-label={title ?? "Copy"}
            icon={state === "copied" ? "check" : state === "failed" ? "error" : "copy"}
            onClick={copy}
        >
            {label && (state === "copied" ? "Copied" : state === "failed" ? "Failed" : label)}
        </Button>
    );
}
