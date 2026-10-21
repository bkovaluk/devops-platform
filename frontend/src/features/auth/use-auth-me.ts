import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { AuthMe } from '@/types/api'
import { useAuthStore } from './auth-store'
import { useViewAsStore } from './view-as'

/** Identity-keyed: signing in again or viewing as someone else never reads
 *  the previous answer out of the cache. */
export const authMeKeys = {
  all: ['auth', 'me'] as const,
  identity: (account: number, viewAs: string | null) =>
    [...authMeKeys.all, account, viewAs ?? ''] as const,
}

/**
 * How long a revoked grant may still render. Staleness is not a deadline —
 * nothing re-asks a stale query until something reads it — so the identity
 * re-answers on a timer while the tab is in front of someone.
 */
const IDENTITY_REFRESH_MS = 60_000

export function fetchAuthMe(): Promise<AuthMe> {
  return apiFetch<AuthMe>('/auth/me')
}

export function useAuthMe() {
  const account = useAuthStore((state) => state.generation)
  const viewAs = useViewAsStore((state) => state.viewAs)
  return useQuery({
    queryKey: authMeKeys.identity(account, viewAs),
    queryFn: fetchAuthMe,
    staleTime: IDENTITY_REFRESH_MS,
    refetchInterval: IDENTITY_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}
