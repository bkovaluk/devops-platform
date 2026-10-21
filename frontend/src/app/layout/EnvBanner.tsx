/**
 * Environment presence as explicit language in a stable place: a strip under
 * the top bar whenever the open surface is about an environment where writes
 * become approval requests.
 */
import { EnvSignal } from '@/components/ui/env-signal'
import { useNeedsApproval } from '@/features/auth/use-needs-approval'
import { envBannerClass } from '@/lib/env'
import { cn } from '@/lib/utils'
import { useFocusedEnv } from './use-focused-env'

export function EnvBanner() {
  const { env } = useFocusedEnv()
  const routed = useNeedsApproval(env)
  if (!routed) return null
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
