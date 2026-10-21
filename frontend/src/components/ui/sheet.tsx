/**
 * A side sheet: a form or a workflow that slides over the workspace from the
 * right, with a pinned header and footer and a pane-gutter body. Built on
 * Base UI Dialog, so focus is trapped and Escape closes it.
 */
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { OVERLAY_BACKDROP } from './dialog'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** One line under the title: what the sheet changes, and where. */
  description?: ReactNode
  /** Pinned under the body: the one submit, and its guard rails. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={OVERLAY_BACKDROP} />
        <DialogPrimitive.Popup
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border bg-panel shadow-overlay outline-none',
            'transition-[translate] duration-[var(--duration-slide)] ease-[var(--ease-slide)]',
            'starting:translate-x-full data-ending-style:translate-x-full',
            className,
          )}
        >
          <header className="flex shrink-0 items-start gap-3 px-gutter-pane pt-5 pb-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogPrimitive.Title className="font-display text-title font-semibold tracking-[-0.01em] text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-xs text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-gutter-pane pb-6">{children}</div>
          {footer && (
            <footer className="flex shrink-0 flex-col gap-3 border-t border-shell-separator px-gutter-pane py-4">
              {footer}
            </footer>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
