/**
 * A conversation's scroll: it stays pinned to the newest turn while an
 * answer streams in, lets go the moment the reader scrolls up, and offers a
 * way back down. shadcn's Message Scroller over its `@shadcn/react`
 * primitive, in the tokens; the way back is an `IconButton`.
 */
import { MessageScroller as MessageScrollerPrimitive } from '@shadcn/react/message-scroller'
import { ArrowDown } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'
import { IconButton } from './icon-button'

export function MessageScrollerProvider(
  props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>,
) {
  return <MessageScrollerPrimitive.Provider {...props} />
}

export function MessageScroller({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  return (
    <MessageScrollerPrimitive.Root
      data-slot="message-scroller"
      className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden', className)}
      {...props}
    />
  )
}

export function MessageScrollerViewport({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
  return (
    <MessageScrollerPrimitive.Viewport
      data-slot="message-scroller-viewport"
      className={cn(
        'size-full min-h-0 min-w-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal data-pending-scroll:invisible',
        className,
      )}
      {...props}
    />
  )
}

export function MessageScrollerContent({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) {
  return (
    <MessageScrollerPrimitive.Content
      data-slot="message-scroller-content"
      className={cn('flex h-max min-h-full flex-col gap-5', className)}
      {...props}
    />
  )
}

export function MessageScrollerItem({
  className,
  scrollAnchor = false,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
  return (
    <MessageScrollerPrimitive.Item
      data-slot="message-scroller-item"
      scrollAnchor={scrollAnchor}
      className={cn('min-w-0 shrink-0', className)}
      {...props}
    />
  )
}

/** Back to the newest turn; shown only while the reader is away from it. */
export function MessageScrollerButton({ className }: { className?: string }) {
  return (
    <MessageScrollerPrimitive.Button
      data-slot="message-scroller-button"
      direction="end"
      render={
        <IconButton
          label="Scroll to the newest message"
          variant="soft"
          size="icon-sm"
          icon={<ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />}
          className={cn(
            'absolute bottom-3 left-1/2 -translate-x-1/2 shadow-overlay transition-[opacity,translate] duration-[var(--duration)] ease-[var(--ease-standard)] data-[active=false]:pointer-events-none data-[active=false]:translate-y-2 data-[active=false]:opacity-0',
            className,
          )}
        />
      }
    />
  )
}
