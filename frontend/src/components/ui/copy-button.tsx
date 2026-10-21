/**
 * A copy control. `size="xs" reveal` in a row that carries `group/row`, where
 * it shows on hover and focus; a toolbar size everywhere else.
 */
import { Check, Copy } from 'lucide-react'
import type * as React from 'react'
import { useCopy } from '@/lib/use-copy'
import { cn } from '@/lib/utils'
import { IconButton } from './icon-button'

const REVEAL =
  'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'

interface CopyButtonProps {
  value: string
  label?: string
  size?: 'xs' | 'default'
  reveal?: boolean
}

export function CopyButton({
  value,
  label = 'Copy to clipboard',
  size = 'default',
  reveal = false,
}: CopyButtonProps) {
  const { copied, copy } = useCopy(value)
  const onClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    void copy()
  }
  return (
    <IconButton
      label={copied ? 'Copied' : label}
      size={size === 'xs' ? 'icon-sm' : 'icon'}
      onClick={onClick}
      className={cn('shrink-0', reveal && !copied && REVEAL)}
      icon={
        // Keyed, so each glyph is a new element and grows in from its starting style.
        <span
          key={copied ? 'check' : 'copy'}
          className="inline-flex transition-[scale] duration-[var(--duration)] ease-[var(--ease-slide)] starting:scale-0"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-state-ok" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </span>
      }
    />
  )
}
