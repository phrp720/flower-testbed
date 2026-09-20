import Icon from "./Icon";
import { cn } from "./cn";

type Props = { size?: number; className?: string; label?: string };

/**
 * The single busy indicator.
 *
 * One component means a pending button, a loading table and a streaming reply
 * all read as the same state rather than as three unrelated animations.
 */
export default function Spinner({ size = 16, className, label }: Props) {
    return (
        <span className={cn("inline-flex items-center gap-2", className)} role="status">
            <Icon
                name="spinner"
                size={size}
                className="motion-safe:[animation:spin_0.9s_linear_infinite]"
            />
            {label && <span className="text-ink-muted">{label}</span>}
            <span className="sr-only">{label ?? "Loading"}</span>
        </span>
    );
}
