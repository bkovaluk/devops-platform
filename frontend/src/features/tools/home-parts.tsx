/**
 * The vocabulary Home lends to the tools that fill it: one tile, one attention
 * cell, one activity row, one rail count. Tools contribute readings in these
 * shapes; Home decides where they land.
 */
import { Link } from '@tanstack/react-router'
import type { ElementType, ReactNode } from 'react'
import { EnvSignal } from '@/components/ui/env-signal'
import { ResourceAnchor } from '@/components/ui/resource-anchor'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import type { ActivityEvent } from './activity-slot'
import type { ToolPath } from './tool-registry'

const ROW_FOCUS =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal'

export function ActivityRow({ event }: { event: ActivityEvent }) {
  const Icon = event.icon
  return (
    <ResourceAnchor
      resource={event.link}
      className={cn(
        'flex min-h-12 items-start gap-3 rounded-md px-3 py-2 transition-colors duration-[var(--duration-fast)] hover:bg-accent',
        ROW_FOCUS,
      )}
    >
      <Icon
        role="img"
        aria-label={event.noun}
        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', event.tint)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          {event.env && <EnvSignal env={event.env} size="sm" className="shrink-0" />}
          <span className="mono truncate text-foreground">{event.resource}</span>
        </span>
        <span className="flex items-center gap-2 text-dim-foreground">
          <span className="truncate text-xs leading-4">
            {event.actor} {event.detail}
          </span>
          <time dateTime={event.at} className="ml-auto shrink-0 font-mono text-nano tabular-nums">
            {relativeTime(event.at)}
            <span className="sr-only"> ({formatDate(event.at)})</span>
          </time>
        </span>
      </span>
    </ResourceAnchor>
  )
}

/** One cell of the attention strip: a section word, one line of state, a
 *  muted qualifier. Content-sized. */
export function AttentionTile({
  eyebrow,
  line,
  qualifier,
  to,
}: {
  eyebrow: string
  line: ReactNode
  qualifier: ReactNode
  to: ToolPath
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex min-w-44 flex-col items-start gap-1 rounded-lg px-5 py-4 text-left transition-colors duration-[var(--duration-fast)] hover:bg-accent',
        ROW_FOCUS,
      )}
    >
      <span className="uppercase-label text-dim-foreground">{eyebrow}</span>
      <span className="flex items-center gap-2 text-heading font-medium text-foreground">
        {line}
      </span>
      <span className="text-xs leading-4 text-muted-foreground">{qualifier}</span>
    </Link>
  )
}

/** A tool's tile on Home: its identity, what it is for, and one reading. */
export function HomeToolTile({
  to,
  label,
  icon: Icon,
  accent,
  description,
  reading,
}: {
  to: ToolPath
  label: string
  icon: ElementType
  accent: string
  description: string
  reading: ReactNode
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors duration-[var(--duration-fast)] hover:bg-accent',
        ROW_FOCUS,
      )}
    >
      <span className="flex items-center gap-2">
        <Icon aria-hidden="true" className={cn('h-4 w-4', accent)} />
        <span className="text-label font-medium text-foreground">{label}</span>
      </span>
      <span className="text-xs leading-4 text-muted-foreground">{description}</span>
      <span className="font-mono text-xs tabular-nums text-dim-foreground">{reading}</span>
    </Link>
  )
}

/** A live reading at the right edge of a rail row. A zero is not news. */
export function RailCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return <span className={cn('count min-w-[2ch] shrink-0 text-right', className)}>{count}</span>
}
