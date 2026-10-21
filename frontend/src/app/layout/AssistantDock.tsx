/**
 * The assistant's slot: a 400px panel docked to the right of the workspace,
 * toggled from the top bar and closed by default. It is there only when the
 * deployment runs an assistant and the principal holds a grant for it to act
 * through. Escape closes it and hands the keyboard back to the toggle.
 *
 * Under a view-as the assistant answers through the viewed person's access
 * and changes nothing; the API refuses its writes, and the dock says so.
 */
import { Eye, SquarePen, Sparkles, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { resetThread, useAssistantStore } from '@/features/assistant/assistant-store'
import { useAssistantAvailable } from '@/features/assistant/use-agent-status'
import { useViewAsStore } from '@/features/auth/view-as'
import { useUIStore } from '@/stores/ui-store'

const AssistantPanel = lazy(() =>
  import('@/app/assistant/AssistantPanel').then((m) => ({ default: m.AssistantPanel })),
)

export const ASSISTANT_DOCK_ID = 'assistant-dock'
export const ASSISTANT_TOGGLE_ID = 'assistant-toggle'

function closeDock() {
  useUIStore.getState().setAssistantOpen(false)
  document.getElementById(ASSISTANT_TOGGLE_ID)?.focus()
}

function PanelLoading() {
  return (
    <div className="flex flex-col gap-2 px-gutter-pane py-4">
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

export function AssistantDock() {
  const open = useUIStore((state) => state.assistantOpen)
  const available = useAssistantAvailable()
  const viewAs = useViewAsStore((state) => state.viewAs)
  const empty = useAssistantStore((state) => state.messages.length === 0)
  const dock = useRef<HTMLElement>(null)
  const shown = open && available

  useEffect(() => {
    const node = dock.current
    if (!shown || !node) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      closeDock()
    }
    node.addEventListener('keydown', onKeyDown)
    return () => node.removeEventListener('keydown', onKeyDown)
  }, [shown])

  if (!shown) return null
  return (
    <aside
      ref={dock}
      id={ASSISTANT_DOCK_ID}
      aria-label="Assistant"
      className="mr-[var(--workspace-inset)] mb-[var(--workspace-inset)] flex w-[400px] shrink-0 flex-col overflow-hidden rounded-workspace border border-workspace-border bg-surface-workspace shadow-workspace transition-[opacity,translate] duration-[var(--duration-slide)] ease-[var(--ease-slide)] starting:translate-x-2 starting:opacity-0 max-md:hidden"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 pr-3 pl-gutter-pane">
        <Sparkles aria-hidden="true" className="mr-1 h-4 w-4 text-muted-foreground" />
        <h2 className="font-display text-heading font-semibold text-foreground">Assistant</h2>
        <IconButton
          label="New chat"
          size="icon-sm"
          className="ml-auto"
          disabled={empty}
          icon={<SquarePen aria-hidden="true" className="h-3.5 w-3.5" />}
          onClick={resetThread}
        />
        <IconButton
          label="Close assistant"
          size="icon-sm"
          icon={<X aria-hidden="true" className="h-3.5 w-3.5" />}
          onClick={closeDock}
        />
      </header>
      {viewAs && (
        <p
          role="note"
          className="mx-gutter-pane mb-2 flex items-start gap-2 rounded-md bg-state-warn-fill px-3 py-2 text-xs text-state-warn"
        >
          <Eye aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Viewing as {viewAs}: answers come through their access, and nothing can be changed.
        </p>
      )}
      <ErrorBoundary label="Assistant">
        <Suspense fallback={<PanelLoading />}>
          <AssistantPanel />
        </Suspense>
      </ErrorBoundary>
    </aside>
  )
}
