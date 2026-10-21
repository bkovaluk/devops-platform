/**
 * An environment: a dot and its name in mono, in the env's own signal colour.
 * `label={false}` for the dot alone, `muted` for an env that is absent.
 * Never a loud badge.
 */
import { envDotClass, envTextClass } from '@/lib/env'
import { cn } from '@/lib/utils'

export interface EnvSignalProps {
  env: string
  size?: 'sm' | 'md'
  label?: false
  muted?: boolean
  className?: string
}

export function EnvSignal({ env, size = 'md', label, muted = false, className }: EnvSignalProps) {
  const dot = (
    <span
      aria-hidden="true"
      className={cn(
        'shrink-0 rounded-full',
        size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
        envDotClass(env),
        muted && 'opacity-25',
      )}
    />
  )
  if (label === false) {
    return (
      <span
        role="img"
        aria-label={env}
        className={cn('inline-flex shrink-0 items-center', className)}
      >
        {dot}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center font-mono text-nano lowercase',
        size === 'sm' ? 'gap-1' : 'gap-1.5',
        envTextClass(env),
        className,
      )}
    >
      {dot}
      <span className="truncate">{env}</span>
    </span>
  )
}
