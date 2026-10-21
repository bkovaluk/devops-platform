/**
 * The one place toasts are drawn: bottom right, newest nearest the corner,
 * three at most. Raised through `lib/toast.ts` from anywhere. A toast enters
 * through `@starting-style`, leaves through Base UI's `data-ending-style`, and
 * can be swiped away (`.toast` in index.css); F6 reaches the region.
 */
import { Toast } from '@base-ui/react/toast'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { toastManager } from '@/lib/toast'
import { cn } from '@/lib/utils'

/** How long a toast stays when its caller does not say. */
const TIMEOUT_MS = 4_000

const MARK = {
  success: { Icon: CircleCheck, tone: 'text-state-ok' },
  info: { Icon: Info, tone: 'text-state-info' },
  error: { Icon: CircleAlert, tone: 'text-state-bad' },
} as const

function isTone(type: string | undefined): type is keyof typeof MARK {
  return type !== undefined && type in MARK
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} timeout={TIMEOUT_MS} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col-reverse gap-2 outline-none">
          <Toasts />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

function Toasts() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => {
    const mark = isTone(toast.type) ? MARK[toast.type] : null
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className="toast relative flex gap-3 rounded-md border border-border bg-panel py-3 pr-9 pl-3.5 text-label text-foreground shadow-overlay"
      >
        {mark && (
          <mark.Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', mark.tone)} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Toast.Title render={<div />} className="font-medium" />
          <Toast.Description render={<div />} className="text-xs text-muted-foreground" />
        </div>
        <Toast.Close
          aria-label="Dismiss"
          className="absolute top-2 right-2 inline-grid h-6 w-6 place-items-center rounded text-dim-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </Toast.Close>
      </Toast.Root>
    )
  })
}
