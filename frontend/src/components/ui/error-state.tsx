/**
 * "Couldn't load {noun}" as an alert, with an optional detail and one soft
 * Retry, in the same three sizes as `EmptyState`.
 */
import { AlertCircle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import type { AsyncStateVariant } from './empty-state'

interface ErrorStateProps {
  noun?: string
  /** Replaces "Couldn't load {noun}" where the failure was not a load. */
  heading?: string
  detail?: ReactNode
  onRetry?: () => void
  variant?: AsyncStateVariant
  className?: string
}

export function ErrorState({
  noun,
  heading,
  detail,
  onRetry,
  variant = 'page',
  className,
}: ErrorStateProps) {
  const text = heading ?? `Couldn't load ${noun ?? 'this'}`
  const retry = onRetry && (
    <Button variant="soft" size="sm" onClick={onRetry}>
      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
      Retry
    </Button>
  )

  if (variant === 'inline') {
    return (
      <div role="alert" className={cn('flex flex-wrap items-center gap-2 text-xs', className)}>
        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-state-bad" />
        <span className="font-medium text-foreground/85">{text}</span>
        {detail && <span className="min-w-0 break-words text-dim-foreground">{detail}</span>}
        {retry && <span className="ml-auto">{retry}</span>}
      </div>
    )
  }

  const inspector = variant === 'inspector'
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        inspector ? 'h-full py-8' : 'py-10',
        className,
      )}
    >
      <AlertCircle
        aria-hidden="true"
        className={cn('text-state-bad', inspector ? 'mb-2.5 h-5 w-5' : 'mb-3 h-8 w-8')}
      />
      <p className="text-sm font-medium text-foreground/85">{text}</p>
      {detail && (
        <div className="mt-1.5 max-w-[280px] break-words text-xs text-dim-foreground">{detail}</div>
      )}
      {retry && <div className="mt-4">{retry}</div>}
    </div>
  )
}
