/**
 * A 3px line along the top of the window in the colour of the env on screen,
 * so the whole window says where you are without a word. It goes neutral
 * wherever no one env is on screen: every env picked, a tool tied to no env,
 * or a pick the open tool cannot show.
 */
import type { ToolDefinition } from '@/features/tools/tool-registry'
import { ALL_ENVS, envDotClass } from '@/lib/env'
import { cn } from '@/lib/utils'
import { useEnvScope } from './env-pick'

export function EnvEdge({ tool }: { tool: ToolDefinition }) {
  const { shown } = useEnvScope(tool)
  const env = shown === ALL_ENVS ? null : shown
  return (
    <div
      aria-hidden="true"
      data-env={env ?? 'none'}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] transition-colors duration-[var(--duration)]',
        env ? envDotClass(env) : 'bg-muted',
      )}
    />
  )
}
