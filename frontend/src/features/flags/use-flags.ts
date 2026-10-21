import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchEvaluations, fetchFlag, fetchFlags, flagKeys } from './flags-api'

/** How often the evaluation strip re-reads its window: once a minute, the
 *  width of one column. */
const EVALUATIONS_REFRESH_MS = 60_000

/** Flags in one env, or every env the caller may read (`all`), each tagged with `env`. */
export function useFlags({ env, q = '' }: { env: string; q?: string }) {
  return useQuery({
    queryKey: flagKeys.list(env, q),
    queryFn: () => fetchFlags(env, q),
    placeholderData: keepPreviousData,
  })
}

export function useFlag(key: string, env: string) {
  return useQuery({
    queryKey: flagKeys.detail(env, key),
    queryFn: () => fetchFlag(key, env),
  })
}

export function useFlagEvaluations(key: string, env: string) {
  return useQuery({
    queryKey: flagKeys.evaluations(env, key),
    queryFn: () => fetchEvaluations(key, env),
    refetchInterval: EVALUATIONS_REFRESH_MS,
  })
}
