/**
 * The principal, as the UI sees it. One hook over `/auth/me`, so no surface
 * reads `is_admin` or a raw scope string to decide what to show.
 *
 * `/auth/me` is informational — the API authorizes every request itself.
 * This is what the shell renders from, nothing more.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { APIError } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { clearPrivateCaches } from './identity-cache'
import {
  ALL_TOOLS,
  type Grants,
  grantsForTool,
  isAdminGrantSet,
  type Scope,
  can as scopeCan,
  canAny as scopeCanAny,
} from './permissions'
import { useAuthMe } from './use-auth-me'
import { useViewAsStore } from './view-as'

/**
 * `unavailable`: we could not ask — not that the answer was "no".
 * `signed-out`: the API wants a credential this tab does not hold.
 */
export type ScopeStatus = 'loading' | 'ready' | 'unavailable' | 'signed-out'

export interface Principal extends Grants {
  status: ScopeStatus
  email: string | null
  name: string | null
  scopes: readonly string[]
  isAdmin: boolean
  /** Who the shell is answering as, while an admin is viewing as someone. */
  viewAs: string | null
  /**
   * Whether the *signed-in* principal is an admin, which differs from
   * `isAdmin` under a lens: the grants above are the target's. The API
   * honours the lens for admins alone, so a current answer naming `view_as`
   * proves one — a remembered answer proves only what used to be true.
   */
  isActorAdmin: boolean
}

const NO_GRANTS: readonly string[] = []

export function useScopes(): Principal {
  const { data, error } = useAuthMe()
  const requested = useViewAsStore((state) => state.viewAs)

  const status: ScopeStatus =
    error instanceof APIError && error.status === 401
      ? 'signed-out'
      : error
        ? 'unavailable'
        : data
          ? 'ready'
          : 'loading'

  const scopes = status === 'ready' && data ? data.scopes : NO_GRANTS
  const viewAs = status === 'ready' ? (data?.view_as ?? null) : null

  return {
    status,
    email: data?.email ?? null,
    name: data?.name ?? null,
    scopes,
    isAdmin: isAdminGrantSet(scopes) || (status === 'ready' && data?.is_admin === true),
    viewAs,
    isActorAdmin:
      requested === null
        ? isAdminGrantSet(scopes) || (status === 'ready' && data?.is_admin === true)
        : viewAs !== null,
    can: (required: Scope) => scopeCan(scopes, required),
    canAny: (required: readonly Scope[]) => scopeCanAny(scopes, required),
  }
}

/**
 * Keep the lens in step with the API's answer. A target the API refuses
 * outright (403, 404) leaves a lens that can never resolve, so the refusal
 * ends it here, saying why. A failure that might pass keeps it.
 *
 * Called once, by the shell.
 */
export function useViewAsSession(): void {
  const { error } = useAuthMe()
  const viewAs = useViewAsStore((state) => state.viewAs)

  useEffect(() => {
    if (!viewAs) return
    if (!(error instanceof APIError) || (error.status !== 403 && error.status !== 404)) return
    toast.error(`Couldn't view as ${viewAs}`, { description: error.detail })
    useViewAsStore.getState().setViewAs(null)
  }, [viewAs, error])
}

function signatureOf(grants: readonly string[]): string {
  return [...new Set(grants)].sort().join(' ')
}

/**
 * Revocation is a deadline, not a hope. When `/auth/me` re-answers with a
 * different grant set for a tool — closed, narrowed, or merely re-spelled —
 * that tool drops its cached data at once, so nothing renders from a grant
 * the principal has lost.
 *
 * Called once, by the shell.
 */
export function useGrantRevocation(): void {
  const { status, scopes } = useScopes()
  const client = useQueryClient()
  const previous = useRef<readonly string[] | null>(null)

  useEffect(() => {
    if (status !== 'ready') return
    const before = previous.current
    previous.current = scopes
    if (!before || signatureOf(before) === signatureOf(scopes)) return
    const changed = ALL_TOOLS.filter(
      (tool) =>
        signatureOf(grantsForTool(before, tool)) !== signatureOf(grantsForTool(scopes, tool)),
    )
    if (changed.length > 0) clearPrivateCaches(client, changed)
  }, [status, scopes, client])
}
