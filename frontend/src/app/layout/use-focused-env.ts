import { useParams, useSearch } from '@tanstack/react-router'
import { ALL_ENVS } from '@/lib/env'

/**
 * The environment the open surface is about. A single-env page names it in its
 * path (`/flags/staging/checkout-v2`); every other surface reads the shell's
 * `env` search param, where absent means every environment.
 */
export function useFocusedEnv(): { env: string; pinned: boolean } {
  const params = useParams({ strict: false }) as { env?: string }
  const search = useSearch({ strict: false })
  if (params.env) return { env: params.env, pinned: true }
  return { env: search.env ?? ALL_ENVS, pinned: false }
}
