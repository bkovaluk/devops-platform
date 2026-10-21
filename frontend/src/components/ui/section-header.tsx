/**
 * The head of a section, in two grades.
 *
 * `page` is a section of a page: the display face at 15px, one line of what
 * it is, a reading in mono nano on the right. `pane` is a section inside a
 * pane or a sheet: a caps label with a hairline running to the edge, which is
 * what makes a caps line read as a boundary. A danger zone is `pane danger`.
 *
 * Neither carries a margin: sections sit `SECTION_GAP` apart and a head sits
 * `SECTION_HEAD_GAP` above its body. `ViewHeader` is the tool's own title row;
 * this is the section beneath it.
 */
import type { ReactNode } from 'react'
import { cn, hasNode } from '@/lib/utils'

/** The caps label a pane section and a fold are headed by. */
export const SECTION_LABEL = 'font-mono text-nano font-medium uppercase tracking-[0.06em]'

/** The reading on a head's right edge, and on a fold's. */
export const SECTION_ASIDE = 'font-mono text-nano tabular-nums text-dim-foreground'

/** Between one section and the next, on the column that stacks them. */
export const SECTION_GAP = 'gap-6'

/** Between a head and its body. */
export const SECTION_HEAD_GAP = 'mb-3'

interface BaseProps {
  title: ReactNode
  /** A reading about the section, not a second title — a count, a window. */
  aside?: ReactNode
  /** The section's one action. */
  action?: ReactNode
  as?: 'h2' | 'h3'
  id?: string
  className?: string
}

interface PageProps extends BaseProps {
  layout: 'page'
  description?: ReactNode
}

interface PaneProps extends BaseProps {
  layout: 'pane'
  icon?: ReactNode
  danger?: boolean
}

export function SectionHeader(props: PageProps | PaneProps) {
  return props.layout === 'page' ? <PageHeader {...props} /> : <PaneHeader {...props} />
}

function PageHeader({
  title,
  description,
  aside,
  action,
  as: Heading = 'h2',
  id,
  className,
}: PageProps) {
  return (
    <header
      data-section-header=""
      className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1', className)}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <Heading
          id={id}
          className="font-display text-heading font-semibold tracking-[-0.01em] text-foreground"
        >
          {title}
        </Heading>
        {description && <p className="truncate text-xs text-dim-foreground">{description}</p>}
      </div>
      {(hasNode(aside) || hasNode(action)) && (
        <div className="flex shrink-0 items-center gap-3">
          {hasNode(aside) && <span className={SECTION_ASIDE}>{aside}</span>}
          {action}
        </div>
      )}
    </header>
  )
}

function PaneHeader({
  title,
  icon,
  danger = false,
  aside,
  action,
  as: Heading = 'h3',
  id,
  className,
}: PaneProps) {
  return (
    <header data-section-header="" className={cn('flex items-center gap-3', className)}>
      <Heading
        id={id}
        className={cn(
          SECTION_LABEL,
          'flex min-w-0 flex-1 items-center gap-3 after:h-px after:flex-1',
          danger ? 'text-state-bad after:bg-state-bad' : 'text-foreground after:bg-shell-separator',
        )}
      >
        {icon && (
          <span aria-hidden="true" className="-mr-1.5 flex shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">
            {icon}
          </span>
        )}
        {title}
      </Heading>
      {hasNode(aside) && <span className={cn(SECTION_ASIDE, 'shrink-0')}>{aside}</span>}
      {action}
    </header>
  )
}
