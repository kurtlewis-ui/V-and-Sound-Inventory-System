'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Heartbeat } from '@/components/Heartbeat';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            // Data is considered fresh for 5 seconds — prevents redundant
            // refetches on re-renders and navigations.
            staleTime: 5000,
            // Keep unused cached data in memory for 5 minutes so navigating
            // back to a page is instant.
            gcTime: 300_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Heartbeat />
      {children}
    </QueryClientProvider>
  );
}
