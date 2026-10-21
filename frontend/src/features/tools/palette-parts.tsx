/**
 * The vocabulary the command palette lends to the tools that fill it: one row
 * shape, one group heading. A tool's palette contribution owns its search and
 * renders its own group; the palette owns the frame.
 */
import { Command } from 'cmdk'
import type { ReactNode } from 'react'

export interface PaletteContributionProps {
  query: string
  onSelected: () => void
}

/** One row for every group: 40px, the accent fill under the cursor. */
export const PALETTE_ROW_CLASS =
  'group relative flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 outline-none transition-colors duration-[var(--duration-fast)] data-[selected=true]:bg-accent'

/** How many rows a group shows before asking for a narrower query. */
export const PALETTE_GROUP_LIMIT = 6

/** The signal bar on the row under the cursor. */
export function SelectionMark() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-[1px] bg-signal opacity-0 group-data-[selected=true]:opacity-100"
    />
  )
}

export function PaletteGroup({
  heading,
  count,
  children,
}: {
  heading: string
  count: number
  children: ReactNode
}) {
  return (
    <Command.Group
      heading={
        <span className="flex items-center justify-between px-3 py-1.5">
          <span className="uppercase-label text-dim-foreground">{heading}</span>
          <span className="count">{count}</span>
        </span>
      }
    >
      {children}
    </Command.Group>
  )
}
