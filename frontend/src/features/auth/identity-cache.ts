/**
 * What the query cache may keep, and when it must let go.
 *
 * Every cached list and detail was fetched *as somebody*. Signing in as
 * someone else, starting or leaving a view-as, and losing the grant that
 * opened a tool all end that authority, and the data has to go with it — a
 * palette or a rail count will otherwise render the previous principal's rows.
 *
 * The roots are enumerated here, beside the tool whose grant pays for them.
 * A tool that keeps state outside the cache declares a `teardown` on its
 * registry entry, and this is what calls it.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { teardownsFor } from '@/features/tools/tool-registry'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from './auth-store'
import { markRevocation } from './identity-generation'
import type { Tool } from './permissions'
import { useViewAsStore } from './view-as'

export const IDENTITY_QUERY_PREFIXES: readonly QueryKey[] = [['auth', 'me']]

/** Private roots, by the tool whose grant opens them. */
export const TOOL_QUERY_PREFIXES: Readonly<Record<Tool, readonly QueryKey[]>> = {
  flags: [['flags']],
  approvals: [['approvals']],
  findings: [['findings']],
}

/** Roots that hold no principal's data, listed so a test can tell "public"
 *  from "forgotten". */
export const PUBLIC_QUERY_PREFIXES: readonly QueryKey[] = [['config'], ['agent', 'status']]

export const PRIVATE_QUERY_PREFIXES: readonly QueryKey[] = [
  ...IDENTITY_QUERY_PREFIXES,
  ...Object.values(TOOL_QUERY_PREFIXES).flat(),
]

/**
 * Cancel and remove what a principal is no longer entitled to. With no
 * `tools`, everything private including the identity itself; with `tools`,
 * only theirs — a revocation while the same person stays signed in.
 */
export function clearPrivateCaches(client: QueryClient, tools?: readonly Tool[]): void {
  if (tools) markRevocation()
  const prefixes = tools
    ? tools.flatMap((tool) => TOOL_QUERY_PREFIXES[tool])
    : PRIVATE_QUERY_PREFIXES
  for (const queryKey of prefixes) {
    void client.cancelQueries({ queryKey })
    client.removeQueries({ queryKey })
  }
  for (const teardown of teardownsFor(tools)) teardown()
}

/** An account change is a cache boundary, and a lens does not survive it. */
useAuthStore.subscribe((state, previous) => {
  if (state.generation === previous.generation) return
  useViewAsStore.getState().setViewAs(null)
  clearPrivateCaches(queryClient)
})

/** So is looking through someone else's grants. */
useViewAsStore.subscribe((state, previous) => {
  if (state.viewAs !== previous.viewAs) clearPrivateCaches(queryClient)
})
