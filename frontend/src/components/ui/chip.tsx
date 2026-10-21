/**
 * A status word, in sentence case, never caps. `tone` is the state it reports
 * and `soft` puts the state's own fill behind it; a word with no state is
 * `neutral`. A chip takes a `hint`, never a `title`.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'
import { Hint } from './hint'

const chipVariants = cva('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-nano', {
  variants: {
    tone: {
      neutral: 'bg-accent text-muted-foreground',
      ok: 'text-state-ok',
      warn: 'text-state-warn',
      bad: 'text-state-bad',
      info: 'text-state-info',
      unknown: 'text-state-unknown',
    },
    soft: { true: '', false: '' },
    mono: { true: 'font-mono tabular-nums', false: '' },
  },
  compoundVariants: [
    { tone: 'ok', soft: true, className: 'bg-state-ok-fill' },
    { tone: 'warn', soft: true, className: 'bg-state-warn-fill' },
    { tone: 'bad', soft: true, className: 'bg-state-bad-fill' },
    { tone: 'info', soft: true, className: 'bg-state-info-fill' },
    { tone: 'unknown', soft: true, className: 'bg-state-unknown-fill' },
  ],
  defaultVariants: { tone: 'neutral', soft: false, mono: false },
})

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>['tone']>

export interface ChipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'title'>, VariantProps<typeof chipVariants> {
  hint?: string | null
}

export function Chip({ className, tone, soft, mono, hint, ...props }: ChipProps) {
  const chip = <span className={cn(chipVariants({ tone, soft, mono }), className)} {...props} />
  return hint ? (
    <Hint label={hint} wrap>
      {chip}
    </Hint>
  ) : (
    chip
  )
}
