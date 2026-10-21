/**
 * The one way the UI talks to the API.
 *
 * Every request carries the bearer token and, while an admin is viewing as
 * someone, the `X-View-As` header. Every request is also judged against the
 * identity it was asked under: once the account or the lens has moved, an
 * attempt is refused before anything leaves the machine, because the
 * authority it was asked with no longer exists.
 */
import { useAuthStore } from '@/features/auth/auth-store'
import { identityGeneration } from '@/features/auth/identity-generation'
import { useViewAsStore, VIEW_AS_HEADER } from '@/features/auth/view-as'

export class APIError extends Error {
  readonly status: number
  /** The API's `detail`: one sentence a person can act on. */
  readonly detail: string
  /** Whether the client already told the user about this refusal. */
  handled: boolean

  constructor(status: number, detail: string, handled = false) {
    super(detail)
    this.name = 'APIError'
    this.status = status
    this.detail = detail
    this.handled = handled
  }
}

/** Work abandoned because the identity behind it moved. Nothing was sent. */
export class IdentityChangedError extends Error {
  readonly handled = true

  constructor(message = 'Request cancelled: identity changed') {
    super(message)
    this.name = 'IdentityChangedError'
  }
}

/** Whether a failure has already been put on screen, so a surface stays quiet. */
export function isHandled(error: unknown): boolean {
  return (error instanceof APIError || error instanceof IdentityChangedError) && error.handled
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

/** `headers` with the credential and the lens of this moment added. */
export function withIdentity(headers?: HeadersInit): Headers {
  const result = new Headers(headers)
  const token = useAuthStore.getState().token
  if (token) result.set('Authorization', `Bearer ${token}`)
  const viewAs = useViewAsStore.getState().viewAs
  if (viewAs) result.set(VIEW_AS_HEADER, viewAs)
  return result
}

function headersFor(init?: RequestInit): Headers {
  const headers = withIdentity(init?.headers)
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json')
  return headers
}

/** The absolute URL of an API path (`/api/agent`). */
export function apiUrl(path: string): string {
  return new URL(`${API_BASE}${path}`, window.location.origin).toString()
}

async function detailOf(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null) {
      const detail = (parsed as { detail?: unknown }).detail
      if (typeof detail === 'string') return detail
      // FastAPI's 422 carries a list of field errors.
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: unknown }
        if (typeof first.msg === 'string') return first.msg
      }
    }
  } catch {
    // Not JSON: the status line is all there is.
  }
  return text.slice(0, 200) || response.statusText || `Request failed (${response.status})`
}

/** A refused response as the `APIError` it stands for; an answer passes through. */
export async function ensureOk(response: Response): Promise<Response> {
  if (!response.ok) throw new APIError(response.status, await detailOf(response))
  return response
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

/**
 * A JSON request. `path` starts with `/` and is relative to the API origin
 * (`/api/flags`, `/auth/me`, `/config`).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const startedUnder = identityGeneration()
  const init: RequestInit = {
    method: options.method ?? 'GET',
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }
  const response = await fetch(apiUrl(path), { ...init, headers: headersFor(init) })
  // An answer that lands after the tab changed hands answers nobody here.
  if (identityGeneration() !== startedUnder) throw new IdentityChangedError()
  await ensureOk(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Query-string builder that drops empty values. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
