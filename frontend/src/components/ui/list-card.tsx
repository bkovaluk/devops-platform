/**
 * A dense list on a card: the perimeter, a well-toned header in column-label
 * type, and a hairline between rows — the one place borders inside a panel are
 * allowed. The card owns one `grid-template-columns`, handed down as
 * `--list-grid`.
 *
 * A row is `ListCard.Surface`: `size` sets its floor at 40, 48 or 56px with
 * 16px sides, `interactive` gives it the accent hover, and `selected` draws
 * the one selection mark, `SELECTED_ROW`.
 */
import { useRender } from '@base-ui/react/use-render'
import * as React from 'react'
import { cn } from '@/lib/utils'

/** The signal bar on a selected row, as the row's own pseudo-element. */
export const SELECTED_BAR =
  "relative select-bar before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-[1px] before:bg-signal before:content-['']"

export const SELECTED_ROW = `bg-accent ${SELECTED_BAR}`

const ROW_SIZE = {
  sm: 'min-h-10 px-4',
  md: 'min-h-12 px-4',
  lg: 'min-h-14 px-4',
} as const

const InListCard = React.createContext(false)

interface ListCardProps extends React.ComponentProps<'div'> {
  columns: string
}

export function ListCard({ columns, className, style, ...props }: ListCardProps) {
  return (
    <InListCard value>
      <div
        className={cn(
          '@container overflow-clip rounded-xl border border-border bg-card',
          className,
        )}
        style={{ ...style, '--list-grid': columns } as React.CSSProperties}
        {...props}
      />
    </InListCard>
  )
}

function ListCardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'column-label grid grid-cols-[var(--list-grid)] items-center gap-x-3 border-b border-border bg-well px-4 py-1.5',
        className,
      )}
      {...props}
    />
  )
}

function ListCardItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li className={cn('border-b border-border last:border-b-0', className)} {...props} />
}

interface ListCardSurfaceProps extends React.ComponentProps<'div'> {
  asChild?: boolean
  interactive?: boolean
  selected?: boolean
  size?: keyof typeof ROW_SIZE
}

function ListCardSurface({
  asChild = false,
  interactive = false,
  selected,
  size,
  className,
  children,
  ...props
}: ListCardSurfaceProps) {
  const inListCard = React.useContext(InListCard)
  const lent = asChild && React.isValidElement(children) ? children : undefined
  return useRender({
    render: lent,
    props: {
      'aria-current': selected ? 'true' : undefined,
      className: cn(
        'grid items-center gap-x-3',
        inListCard && 'grid-cols-[var(--list-grid)]',
        size && ROW_SIZE[size],
        interactive && [
          'transition-colors duration-[var(--duration-fast)] hover:bg-accent',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal',
        ],
        selected && SELECTED_ROW,
        className,
      ),
      ...props,
      children: lent ? undefined : children,
    },
  })
}

ListCard.Header = ListCardHeader
ListCard.Item = ListCardItem
ListCard.Surface = ListCardSurface
