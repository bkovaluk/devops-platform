import { apiFetch } from '@/lib/api-client'
import type { FindingDetail, FindingList, ResolveFindingBody } from '@/types/api'
import { FACET_KEYS, type FindingsParams } from './findings-search'

/** Every findings root starts here, which is what a revocation clears. */
export const findingKeys = {
  all: ['findings'] as const,
  lists: () => [...findingKeys.all, 'list'] as const,
  list: (env: string, params: FindingsParams) => [...findingKeys.lists(), env, params] as const,
  details: () => [...findingKeys.all, 'detail'] as const,
  detail: (env: string, id: string) => [...findingKeys.details(), env, id] as const,
}

/** How many findings one page asks for. */
export const PAGE_SIZE = 100

const path = (id: string) => `/api/findings/${encodeURIComponent(id)}`

/** The list's query string: one key per value of a facet, defaults left out. */
function listQuery(env: string, params: FindingsParams, offset: number): string {
  const search = new URLSearchParams({ env, status: params.status, window: params.window })
  if (params.includeTriage) search.set('triage', 'true')
  if (params.query.trim()) search.set('q', params.query.trim())
  for (const key of FACET_KEYS) {
    for (const value of params.filters[key]) search.append(key, value)
  }
  if (offset > 0) search.set('offset', String(offset))
  search.set('limit', String(PAGE_SIZE))
  return `?${search.toString()}`
}

export function fetchFindings(
  env: string,
  params: FindingsParams,
  offset = 0,
): Promise<FindingList> {
  return apiFetch<FindingList>(`/api/findings${listQuery(env, params, offset)}`)
}

export function fetchFinding(env: string, id: string): Promise<FindingDetail> {
  return apiFetch<FindingDetail>(`${path(id)}?env=${encodeURIComponent(env)}`)
}

export function acknowledgeFinding(env: string, id: string): Promise<FindingDetail> {
  return apiFetch<FindingDetail>(`${path(id)}/acknowledge?env=${encodeURIComponent(env)}`, {
    method: 'POST',
  })
}

export function closeFinding(
  env: string,
  id: string,
  body: ResolveFindingBody,
): Promise<FindingDetail> {
  return apiFetch<FindingDetail>(`${path(id)}/close?env=${encodeURIComponent(env)}`, {
    method: 'POST',
    body,
  })
}
