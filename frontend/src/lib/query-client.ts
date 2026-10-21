import { QueryClient } from '@tanstack/react-query'
import { APIError } from './api-client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        // A 4xx is an answer, not a failure: asking again changes nothing.
        retry: (failureCount, error) => {
          if (error instanceof APIError && error.status < 500) return false
          return failureCount < 2
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      mutations: {
        // A 5xx gets one more try; anything the server refused stays refused.
        retry: (failureCount, error) =>
          error instanceof APIError && error.status >= 500 && failureCount < 1,
        retryDelay: 1000,
      },
    },
  })
}

/** The app's one cache. Tests build their own with `createQueryClient`. */
export const queryClient = createQueryClient()
