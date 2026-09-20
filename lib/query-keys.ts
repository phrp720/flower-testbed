/**
 * Every query key in one place.
 *
 * Invalidation is only as reliable as the keys agreeing with each other, and a
 * key typed inline at a call site is the usual way that stops being true.
 */
export const queryKeys = {
  experiments: {
    all: ['experiments'] as const,
    list: () => [...queryKeys.experiments.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.experiments.all, 'detail', id] as const,
  },
  resources: ['resources'] as const,
  agent: {
    settings: ['agent', 'settings'] as const,
    tokens: ['agent', 'tokens'] as const,
    conversations: ['agent', 'conversations'] as const,
    thread: (id: string) => ['agent', 'thread', id] as const,
  },
} as const;
