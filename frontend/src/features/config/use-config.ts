import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { AppConfig } from '@/types/api'

/** Deployment config: the app's name and its environments. Served to anyone
 *  and identical for every principal, so it outlives identity changes. */
export const configQuery = queryOptions({
  queryKey: ['config'],
  queryFn: () => apiFetch<AppConfig>('/config'),
  staleTime: Number.POSITIVE_INFINITY,
})

export function useConfig() {
  return useQuery(configQuery)
}

/** The environments in deployment order, empty until the config lands. */
export function useEnvironments(): readonly string[] {
  return useConfig().data?.environments ?? []
}
