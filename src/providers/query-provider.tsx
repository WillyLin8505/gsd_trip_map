'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Browser singleton — one stable QueryClient per browser tab.
 *
 * Module-level const is the standard Next.js App Router pattern per:
 * tanstack.com/query/v5/docs/framework/react/guides/ssr
 *
 * Note: HMR in dev mode resets this singleton (cache lost), which is acceptable.
 * In production there is no HMR so this is stable.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 60s prevents immediate refetch on hydration
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
