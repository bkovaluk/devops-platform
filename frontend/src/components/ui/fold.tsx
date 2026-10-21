/**
 * Fold, FoldRow and ShowMore — everything that opens and closes, three ways.
 *
 * A section that folds says so before it is touched: the chevron sits on the
 * left and turns (never swaps), a dashed rule runs where a fixed section's is
 * solid, and while open its body hangs off a dashed guide. `Fold` is that
 * section, `FoldRow` the same promise made by a row in a list, and `ShowMore`
 * the "+N more" that lengthens a list without being a section.
 *
 * Built on Base UI Collapsible. Bodies stay mounted while closed, as
 * `hidden="until-found"`, so find-in-page reaches them and opens the fold.
 * Expanded and selected are separate axes: an open row is filled, and draws
 * the selection mark only when `selected`.
 */
import { Collapsible } from '@base-ui/react/collapsible'
import { ChevronRight } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { cn, hasNode } from '@/lib/utils'
import { SELECTED_ROW } from './list-card'
import { SECTION_ASIDE, SECTION_LABEL } from './section-header'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

const CHEVRON =
  'h-3.5 w-3.5 shrink-0 text-dim-foreground transition-transform duration-[var(--duration-fast)] group-data-panel-open:rotate-90 motion-reduce:transition-none'

const GUIDE = 'border-l border-dashed border-border'

/** The body fades and drops in as it opens. */
const OPENS =
  'transition-[opacity,translate] duration-[var(--duration)] ease-[var(--ease-standard)] data-starting-style:-translate-y-1 data-starting-style:opacity-0'

interface OpenProps {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface FoldProps extends OpenProps {
  title: ReactNode
  /** A reading about the section — a count — after its rule. */
  aside?: ReactNode
  as?: 'h2' | 'h3' | 'h4'
  /** A danger zone: label and rule in the bad state colour. */
  danger?: boolean
  children: ReactNode
  className?: string
}

export function Fold({
  title,
  aside,
  defaultOpen,
  open,
  onOpenChange,
  as: Heading = 'h3',
  danger = false,
  children,
  className,
}: FoldProps) {
  const headingId = useId()
  return (
    <Collapsible.Root
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      render={<section aria-labelledby={headingId} className={className} />}
    >
      <div className="group/fold -mx-2 flex items-center gap-3 rounded-md px-2 transition-colors duration-[var(--duration-fast)] hover:bg-accent">
        <Heading
          id={headingId}
          className={cn(
            SECTION_LABEL,
            'min-w-0 flex-1',
            danger ? 'text-state-bad' : 'text-foreground',
          )}
        >
          <Collapsible.Trigger
            className={cn(
              'group flex w-full items-center gap-1.5 rounded-sm py-1.5 text-left uppercase tracking-[inherit]',
              FOCUS,
            )}
          >
            <ChevronRight aria-hidden="true" className={CHEVRON} />
            <span
              className={cn(
                'flex min-w-0 flex-1 items-center',
                'after:ml-1.5 after:flex-1 after:border-t after:border-dashed after:transition-colors after:duration-[var(--duration-fast)]',
                danger
                  ? 'after:border-state-bad/50 group-hover/fold:after:border-state-bad'
                  : 'after:border-border group-hover/fold:after:border-muted-foreground',
              )}
            >
              {title}
            </span>
          </Collapsible.Trigger>
        </Heading>
        {hasNode(aside) && <span className={cn(SECTION_ASIDE, 'shrink-0')}>{aside}</span>}
      </div>
      {/* A body hidden until found keeps its box, so its gap comes with it open. */}
      <Collapsible.Panel
        hiddenUntilFound
        className={cn('ml-[7px] pl-5 data-open:mt-3', GUIDE, OPENS)}
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

interface FoldRowProps extends OpenProps {
  /** What the row says while closed. It is the trigger's content: text and
   *  marks, never a control. */
  summary: ReactNode
  /** The row's own controls. They sit in a column of their own after the
   *  trigger, so pressing one never opens the row. */
  actions?: ReactNode
  'aria-label'?: string
  selected?: boolean
  /** A 32px row for a quiet line inside other content (a tool call in a
   *  thread) rather than a row of a list. */
  dense?: boolean
  children: ReactNode
  className?: string
}

/** A row that opens in place. The chevron holds a 28px lane at the row's start
 *  and the body is indented under it. */
export function FoldRow({
  summary,
  actions,
  'aria-label': ariaLabel,
  children,
  defaultOpen,
  open,
  onOpenChange,
  selected = false,
  dense = false,
  className,
}: FoldRowProps) {
  const hasActions = hasNode(actions)
  return (
    <Collapsible.Root
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className={cn('data-open:bg-accent data-open:pb-3', className)}
    >
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto] items-center transition-colors duration-[var(--duration-fast)] hover:bg-accent',
          selected && SELECTED_ROW,
        )}
      >
        <Collapsible.Trigger
          aria-current={selected ? 'true' : undefined}
          aria-label={ariaLabel}
          className={cn(
            'group grid w-full grid-cols-[28px_minmax(0,1fr)] items-center text-left',
            dense ? 'min-h-8' : 'min-h-12',
            !hasActions && 'pr-4',
            FOCUS,
            'focus-visible:-outline-offset-2',
          )}
        >
          <span className="flex h-7 w-7 items-center justify-center">
            <ChevronRight aria-hidden="true" className={CHEVRON} />
          </span>
          <span className="min-w-0">{summary}</span>
        </Collapsible.Trigger>
        {hasActions && <div className="flex items-center gap-1 pr-4 pl-2">{actions}</div>}
      </div>
      <Collapsible.Panel
        hiddenUntilFound
        className={cn('ml-[13.5px] pr-4 pl-[13.5px]', GUIDE, OPENS)}
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

interface ShowMoreProps {
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The id of the list it lengthens. */
  controls: string
  className?: string
}

/** The "+N more" under a list. The caller draws the list and holds `open`. */
export function ShowMore({ count, open, onOpenChange, controls, className }: ShowMoreProps) {
  if (count <= 0 && !open) return null
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={() => onOpenChange(!open)}
      className={cn(
        'rounded-sm font-mono text-nano text-dim-foreground transition-colors duration-[var(--duration-fast)] hover:text-foreground',
        FOCUS,
        className,
      )}
    >
      {open ? 'Show fewer' : `+${count} more`}
    </button>
  )
}
