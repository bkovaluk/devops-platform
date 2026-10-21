/**
 * One answer to "does a change here route through approval?".
 *
 * The deployment names its direct environments in `/config`; a change
 * anywhere else becomes an approval request — for everyone, admins included.
 * `all` targets nothing, so it needs no approval and offers no write.
 * Until the config has loaded every env is treated as approval-routed: the
 * guard rails err toward saying more, never less.
 */
import { useConfig } from '@/features/config/use-config'

export function needsApproval(env: string, directEnvs: readonly string[] | undefined): boolean {
  if (env === 'all') return false
  return !(directEnvs ?? []).includes(env)
}

export function useNeedsApproval(env: string): boolean {
  const { data } = useConfig()
  return needsApproval(env, data?.direct_envs)
}
