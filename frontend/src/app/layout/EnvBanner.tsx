/**
 * Environment presence as explicit language in a stable place: a strip under
 * the top bar whenever the open tool files its writes there as approval
 * requests, for the env it is showing.
 */
import { EnvSignal } from '@/components/ui/env-signal'
import { useNeedsApproval } from '@/features/auth/use-needs-approval'
import type { ToolDefinition } from '@/features/tools/tool-registry'
import { ALL_ENVS, envBannerClass } from '@/lib/env'
import { cn } from '@/lib/utils'
import { useEnvScope } from './env-pick'

export function EnvBanner({ tool }: { tool: ToolDefinition }) {
  const { shown } = useEnvScope(tool)
  const env = shown ?? ALL_ENVS
  const routed = useNeedsApproval(env)
  if (!tool.approvalRouted || !routed) return null
  return (
    <div
      role="status"
      className={cn(
        'flex h-7 shrink-0 items-center gap-2 px-4 font-mono text-nano',
        envBannerClass(env),
      )}
    >
      <EnvSignal env={env} />
      <span>· {env === 'prod' ? 'live · ' : ''}writes require approval</span>
    </div>
  )
}
