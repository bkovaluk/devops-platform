/**
 * A centred dialog in the form layout: 480px, a pane gutter, one action row.
 * Used for confirms and short forms; anything longer is a `Sheet`.
 *
 * Built on Base UI Dialog, so focus is trapped and Escape closes it. Overlays
 * enter through `@starting-style` (the `starting:` variant) and leave through
 * Base UI's `data-ending-style`, which holds the popup mounted until the
 * transition ends.
 */
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The scrim under every modal overlay. */
export const OVERLAY_BACKDROP =
  'fixed inset-0 z-50 bg-[var(--color-overlay)] transition-opacity duration-[var(--duration)] ease-[var(--ease-standard)] starting:opacity-0 data-ending-style:opacity-0'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** The action row: a secondary, then the one consequence. */
  actions: ReactNode
  className?: string
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  className,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={OVERLAY_BACKDROP} />
        <DialogPrimitive.Popup
          className={cn(
            'glass fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl p-6 shadow-overlay outline-none',
            'transition-[opacity,scale] duration-[var(--duration)] ease-[var(--ease-standard)]',
            'starting:scale-95 starting:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0',
            className,
          )}
        >
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="font-display text-title font-semibold text-foreground">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {children}
          <div className="flex justify-end gap-2">{actions}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
