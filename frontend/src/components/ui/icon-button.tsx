/**
 * A button that is an icon alone. `label` is its accessible name and its hint
 * both, so the two cannot drift and no call site reaches for `title=`.
 */
import type * as React from 'react'
import { Button, type ButtonProps } from './button'

export interface IconButtonProps extends Omit<
  ButtonProps,
  'size' | 'children' | 'hint' | 'aria-label' | 'asChild'
> {
  label: string
  icon: React.ReactNode
  /** `icon-sm` (28px) in a row, `icon` (32px) in a toolbar. */
  size?: 'icon-sm' | 'icon'
}

export function IconButton({
  label,
  icon,
  size = 'icon',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <Button variant={variant} size={size} aria-label={label} hint={label} {...props}>
      {icon}
    </Button>
  )
}
