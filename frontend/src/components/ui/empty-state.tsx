/**
 * The empty state, in three sizes. `page` for an empty list or view, with at
 * most one call to action; `inspector` for an idle detail pane, no action;
 * `inline` for one muted line inside a section.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type AsyncStateVariant = 'page' | 'inspector' | 'inline'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  body?: ReactNode
  /** Exactly one. When an empty state owns the action, the header hides its own. */
  cta?: ReactNode
  variant?: AsyncStateVariant
  className?: string
}

export function EmptyState({
  icon,
  title,
  body,
  cta,
  variant = 'page',
  className,
}: EmptyStateProps) {
  if (variant === 'inline') {
    return <p className={cn('text-xs text-dim-foreground', className)}>{title}</p>
  }
  const inspector = variant === 'inspector'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        inspector ? 'h-full py-8' : 'py-10',
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className={cn(
            'text-dim-foreground',
            inspector ? 'mb-2.5 [&_svg]:h-5 [&_svg]:w-5' : 'mb-3 [&_svg]:h-8 [&_svg]:w-8',
          )}
        >
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-foreground/85">{title}</p>
      {body && <div className="mt-1.5 max-w-[280px] text-xs text-dim-foreground">{body}</div>}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  )
}
