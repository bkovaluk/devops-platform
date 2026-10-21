/**
 * A box of fields or rows: `well` inset, `card` raised, `framed` with a
 * hairline and the workspace shadow. Always `rounded-lg`; `asChild` lends the
 * classes to an element that cannot be wrapped.
 */
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const PANEL = cva('rounded-lg', {
  variants: {
    tone: {
      well: 'bg-well',
      card: 'bg-card',
      framed: 'border border-border bg-panel shadow-workspace',
    },
    pad: { sm: 'p-2', md: 'p-3', lg: 'p-4', none: '' },
  },
  defaultVariants: { tone: 'well', pad: 'md' },
})

export interface PanelProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof PANEL> {
  asChild?: boolean
}

export function Panel({ tone, pad, asChild = false, className, children, ...props }: PanelProps) {
  const lent = asChild && React.isValidElement(children) ? children : undefined
  return useRender({
    render: lent,
    props: {
      className: cn(PANEL({ tone, pad }), className),
      ...props,
      children: lent ? undefined : children,
    },
  })
}
