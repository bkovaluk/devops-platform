/**
 * One turn of a conversation: who said it (`align`, `start` for the
 * assistant, `end` for the person) and what it holds. shadcn's Message, in
 * the tokens; a turn's words sit in a `Bubble`, its tool calls and proposals
 * beside them in `MessageContent`.
 */
import type * as React from 'react'
import { cn } from '@/lib/utils'

export function MessageGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-group"
      className={cn('flex min-w-0 flex-col gap-2', className)}
      {...props}
    />
  )
}

export function Message({
  className,
  align = 'start',
  ...props
}: React.ComponentProps<'div'> & { align?: 'start' | 'end' }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        'group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse',
        className,
      )}
      {...props}
    />
  )
}

export function MessageContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        'flex w-full min-w-0 flex-col gap-2 break-words group-data-[align=end]/message:items-end',
        className,
      )}
      {...props}
    />
  )
}

export function MessageHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-header"
      className={cn('flex min-w-0 items-center gap-2 text-xs text-dim-foreground', className)}
      {...props}
    />
  )
}

export function MessageFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        'flex min-w-0 items-center gap-2 text-xs text-dim-foreground group-data-[align=end]/message:justify-end',
        className,
      )}
      {...props}
    />
  )
}
