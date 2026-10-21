/**
 * A tool's own title row: identity icon, the page's `h1`, a reading beside it,
 * and the actions on the right. `gutter` matches the surface it heads — `page`
 * for a full-width page, `list` for the list column, `pane` for a detail pane.
 */
import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const GUTTER = {
  page: 'px-gutter-page',
  list: 'px-gutter-list',
  pane: 'px-gutter-pane',
} as const

export function ViewHeader({
  title,
  icon: Icon,
  accent,
  aside,
  actions,
  gutter = 'page',
  className,
}: {
  title: ReactNode
  icon?: ElementType
  accent?: string
  aside?: ReactNode
  actions?: ReactNode
  gutter?: keyof typeof GUTTER
  className?: string
}) {
  return (
    <header className={cn('flex h-14 shrink-0 items-center gap-3', GUTTER[gutter], className)}>
      {Icon && <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', accent)} />}
      <h1 className="min-w-0 truncate font-display text-title font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h1>
      {aside && <span className="count shrink-0">{aside}</span>}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
