"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/app/components/ui";

type Health = { database: "up" | "down"; latencyMs?: number; error?: string };

/**
 * Says so when the database is unreachable.
 *
 * Worth a permanent strip rather than a dialog: this is a condition, not an
 * event. It persists until someone fixes it, it affects every page at once, and
 * a modal you dismiss would leave the app looking healthy while it is not --
 * which is the real danger here, since a dashboard with no data reads as "no
 * experiments yet" rather than as a fault.
 *
 * The wording is for an operator, because on a self-hosted testbed the person
 * reading this is the person who can fix it. "We're working to restore service"
 * would be addressed to nobody. What is wrong and what it means for what is on
 * screen is the whole message; the driver's error adds nothing an operator does
 * not already know from their own logs.
 */
export default function SystemBanner() {
    const { data } = useQuery({
        queryKey: ["health"],
        queryFn: () => apiFetch<Health>("/api/health"),
        // Cheap enough to ask often, and the answer is only useful while fresh.
        // Faster once it is down, so the banner clears soon after a fix.
        refetchInterval: (query) => (query.state.data?.database === "down" ? 5000 : 30000),
        refetchOnWindowFocus: true,
        retry: false,
        // A failed request is itself evidence: if /api/health cannot be reached
        // the server is down, which the banner should report rather than hide.
        placeholderData: (previous) => previous,
    });

    // `undefined` is "not asked yet", not "healthy" -- no banner before the
    // first answer, or every load would flash a warning.
    if (!data || data.database === "up") return null;

    return (
        // Above the navigation rather than under it, and one line: this is a
        // status strip, not a panel. Warning rather than danger because nothing
        // has been lost -- the app is intact and waiting for its database.
        <div
            role="status"
            className="shrink-0 border-b border-warn-line bg-warn-surface"
        >
            <div className="max-w-7xl mx-auto px-6 py-1.5 flex items-center justify-center gap-2 text-xs">
                <Icon name="warning" size={14} className="shrink-0 text-warn" />
                <p className="min-w-0 truncate text-ink">
                    Database unreachable — figures may be out of date and nothing can be
                    saved.
                </p>
            </div>
        </div>
    );
}
