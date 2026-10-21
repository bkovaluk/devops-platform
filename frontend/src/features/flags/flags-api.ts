import { apiFetch, query } from '@/lib/api-client'
import type { EvaluationSeries, Flag, FlagChange, FlagCreate, FlagUpdate } from '@/types/api'

/** Every flags root starts here, which is what a revocation clears. */
export const flagKeys = {
  all: ['flags'] as const,
  lists: () => [...flagKeys.all, 'list'] as const,
  list: (env: string, q: string) => [...flagKeys.lists(), env, q] as const,
  detail: (env: string, key: string) => [...flagKeys.all, 'detail', env, key] as const,
  evaluations: (env: string, key: string) => [...flagKeys.all, 'evaluations', env, key] as const,
}

const path = (key: string) => `/api/flags/${encodeURIComponent(key)}`

export function fetchFlags(env: string, q = ''): Promise<Flag[]> {
  return apiFetch<Flag[]>(`/api/flags${query({ env, q })}`)
}

export function fetchFlag(key: string, env: string): Promise<Flag> {
  return apiFetch<Flag>(`${path(key)}${query({ env })}`)
}

export function fetchEvaluations(
  key: string,
  env: string,
  minutes = 60,
): Promise<EvaluationSeries> {
  return apiFetch<EvaluationSeries>(`${path(key)}/evaluations${query({ env, minutes })}`)
}

export function createFlag(env: string, body: FlagCreate): Promise<FlagChange> {
  return apiFetch<FlagChange>(`/api/flags${query({ env })}`, { method: 'POST', body })
}

export function updateFlag(key: string, env: string, body: FlagUpdate): Promise<FlagChange> {
  return apiFetch<FlagChange>(`${path(key)}${query({ env })}`, { method: 'PUT', body })
}

export function deleteFlag(key: string, env: string): Promise<FlagChange> {
  return apiFetch<FlagChange>(`${path(key)}${query({ env })}`, { method: 'DELETE' })
}
