"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

/**
 * Server-state cache for the whole app.
 *
 * The client is created inside component state rather than at module scope so
 * each render tree gets its own -- a module-level client would be shared across
 * requests on the server and leak one user's data into another's cache.
 */
export default function QueryProvider({ children }: { children: ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Experiment state changes underneath us constantly, so
                        // treat cached data as stale immediately and let
                        // refetchInterval / invalidation drive freshness.
                        staleTime: 0,
                        // A 401 or a missing experiment will never succeed on a
                        // retry; only retry what looks transient.
                        retry: (failureCount, error) => {
                            const status = (error as { status?: number })?.status;
                            if (status && status >= 400 && status < 500) return false;
                            return failureCount < 2;
                        },
                        refetchOnWindowFocus: true,
                    },
                },
            })
    );

    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
