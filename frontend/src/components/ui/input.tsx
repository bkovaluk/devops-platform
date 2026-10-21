/**
 * Form fields. Two heights, like buttons: `sm` (32px) in a toolbar, `default`
 * (40px) in a form. A label is `field-label` — sentence case, never caps.
 */
import type * as React from 'react'
import { cn } from '@/lib/utils'

const FIELD =
  'w-full rounded-md bg-well px-3 text-sm text-foreground placeholder:text-dim-foreground outline-none transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-signal aria-invalid:outline-2 aria-invalid:outline-state-bad disabled:opacity-50'

const HEIGHT = { sm: 'h-8 text-xs', default: 'h-10' } as const

interface InputProps extends Omit<React.ComponentProps<'input'>, 'size'> {
  size?: keyof typeof HEIGHT
}

export function Input({ className, size = 'default', ...props }: InputProps) {
  return <input className={cn(FIELD, HEIGHT[size], className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea className={cn(FIELD, 'min-h-20 resize-y py-2 leading-5', className)} {...props} />
  )
}

export function Label({
  className,
  htmlFor,
  children,
  ...props
}: React.ComponentProps<'label'> & { htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('field-label', className)} {...props}>
      {children}
    </label>
  )
}

/** A label, its control, and one line of help or the field's error. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
}: {
  label: string
  htmlFor: string
  help?: React.ReactNode
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-state-bad">
          {error}
        </p>
      ) : (
        help && <p className="text-xs text-dim-foreground">{help}</p>
      )}
    </div>
  )
}
