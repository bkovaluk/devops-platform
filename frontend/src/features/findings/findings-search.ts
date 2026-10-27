/**
 * The Investigations tool's URL state, validated by the router.
 *
 * `/investigations?status=…&window=…&q=…&triage=true` plus one list per facet;
 * one finding is `/investigations/<env>/<id>`. Every default is written as an
 * absence, so the plain list is a plain link, and anything a hand-edited link
 * carries that the list cannot mean degrades to the default.
 *
 * `env` is the shell's (the root route's) and is not repeated here.
 */
import { z } from 'zod'
import type { FindingStatus, FindingWindow, Resolution } from '@/types/api'

/** Every facet the list can be narrowed by, in the order the row draws them. */
export const FACET_KEYS = [
  'severity',
  'outcome',
  'confidence',
  'effort',
  'type',
  'kind',
  'tool',
  'model',
  'resolution',
  'resolved_by',
] as const

export type FacetKey = (typeof FACET_KEYS)[number]

export const STATUSES = [
  'open',
  'acknowledged',
  'closed',
] as const satisfies readonly FindingStatus[]

export const RESOLUTIONS = [
  'confirmed',
  'false_positive',
  'wrong',
  'dismissed',
] as const satisfies readonly Resolution[]

/** A year is the closed tab's alone: the open queue never holds anything that old. */
export const CLOSED_WINDOWS = [
  '24h',
  '7d',
  '30d',
  '90d',
  '365d',
] as const satisfies readonly FindingWindow[]

export const WINDOWS: readonly FindingWindow[] = ['24h', '7d', '30d', '90d']

export const DEFAULT_WINDOW: FindingWindow = '30d'

/** The longest search the API takes. */
export const QUERY_LIMIT = 200

export type FindingFilters = Readonly<Record<FacetKey, readonly string[]>>

export const NO_FILTERS: FindingFilters = {
  severity: [],
  outcome: [],
  confidence: [],
  effort: [],
  type: [],
  kind: [],
  tool: [],
  model: [],
  resolution: [],
  resolved_by: [],
}

/** What a list is, as the views reason about it. */
export interface FindingsParams {
  status: FindingStatus
  window: FindingWindow
  query: string
  includeTriage: boolean
  filters: FindingFilters
}

const facet = z
  .array(z.string().trim().min(1))
  .transform((values) => [...new Set(values)])
  .optional()
  .catch(undefined)

export const findingsSearchSchema = z.object({
  /** The review state. Absent is open. */
  status: z.enum(STATUSES).optional().catch(undefined),
  /** How far back the list reads. Absent is 30 days. */
  window: z.enum(CLOSED_WINDOWS).optional().catch(undefined),
  /** Text matched against title, alarm, resource and error signature. */
  q: z.string().optional().catch(undefined),
  /** Include what triage recorded without investigating. */
  triage: z.boolean().optional().catch(undefined),
  ...(Object.fromEntries(FACET_KEYS.map((key) => [key, facet])) as Record<FacetKey, typeof facet>),
})

export type FindingsSearch = z.output<typeof findingsSearchSchema>

export const findingSearchSchema = z.object({
  /** The close dialog is open, on this answer. */
  close: z.enum(RESOLUTIONS).optional().catch(undefined),
})

/** The windows a tab may be read over. */
export function windowsFor(status: FindingStatus): readonly FindingWindow[] {
  return status === 'closed' ? CLOSED_WINDOWS : WINDOWS
}

/** A window the tab can be asked for: a year carried onto a tab that offers
 *  none reads as the deepest one it does. */
export function windowFor(status: FindingStatus, window: FindingWindow): FindingWindow {
  return windowsFor(status).includes(window) ? window : '90d'
}

/** The list a URL names. */
export function paramsOf(search: FindingsSearch): FindingsParams {
  const status = search.status ?? 'open'
  return {
    status,
    window: windowFor(status, search.window ?? DEFAULT_WINDOW),
    query: (search.q ?? '').slice(0, QUERY_LIMIT),
    includeTriage: search.triage ?? false,
    filters: Object.fromEntries(
      FACET_KEYS.map((key) => [key, search[key] ?? []]),
    ) as unknown as FindingFilters,
  }
}

/** The keys a list is said in, every default as an absence. */
export function searchOf(params: FindingsParams): FindingsSearch {
  const query = params.query.trim()
  return {
    status: params.status === 'open' ? undefined : params.status,
    window: params.window === DEFAULT_WINDOW ? undefined : params.window,
    q: query || undefined,
    triage: params.includeTriage || undefined,
    ...(Object.fromEntries(
      FACET_KEYS.map((key) => [
        key,
        params.filters[key].length ? [...params.filters[key]] : undefined,
      ]),
    ) as Record<FacetKey, string[] | undefined>),
  }
}

/** Whether anything narrows the list beyond its tab and window. */
export function isNarrowed(params: FindingsParams): boolean {
  return params.query.trim() !== '' || FACET_KEYS.some((key) => params.filters[key].length > 0)
}
