/**
 * The words of a turn. shadcn's Bubble, in the tokens: `filled` is the
 * person's own words on the solid accent fill, `plain` is the assistant's,
 * set as reading text with no box, so the thread reads as a document with
 * the person's questions marked rather than as two columns of balloons.
 */
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const bubbleVariants = cva(
  'group/bubble relative flex w-fit min-w-0 flex-col gap-1 group-data-[align=end]/message:self-end',
  {
    variants: {
      variant: {
        filled:
          'max-w-[85%] *:data-[slot=bubble-content]:rounded-lg *:data-[slot=bubble-content]:bg-accent *:data-[slot=bubble-content]:px-3 *:data-[slot=bubble-content]:py-2 *:data-[slot=bubble-content]:text-foreground',
        plain: 'max-w-full *:data-[slot=bubble-content]:text-foreground/90',
      },
    },
    defaultVariants: { variant: 'filled' },
  },
)

export function Bubble({
  variant = 'filled',
  className,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof bubbleVariants>) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  )
}

export function BubbleContent({ className, render, ...props }: useRender.ComponentProps<'div'>) {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(
      {
        className: cn(
          'w-fit max-w-full min-w-0 text-sm leading-relaxed break-words whitespace-pre-wrap',
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: 'bubble-content' },
  })
}
