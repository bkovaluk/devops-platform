/**
 * The shell is two surfaces told apart by shape: the chrome — the rail and the
 * top bar, drawn as one continuous L on `--surface-chrome` — and the workspace,
 * the panel inset into it and the app's one `<main>`. Below `md` the inset,
 * radius, edge and lift all go to zero together.
 */
import type { ReactNode } from 'react'

export function AppChrome({
  rail,
  top,
  children,
}: {
  rail: ReactNode
  top: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid h-screen grid-cols-[minmax(0,1fr)] grid-rows-[3rem_minmax(0,1fr)] overflow-hidden bg-surface-chrome md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="hidden md:col-start-1 md:row-span-2 md:row-start-1 md:block">{rail}</div>
      <div className="min-w-0 md:col-start-2 md:row-start-1">{top}</div>
      <div className="flex min-h-0 min-w-0 flex-col md:col-start-2 md:row-start-2">{children}</div>
    </div>
  )
}

export function WorkspacePanel({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative mr-[var(--workspace-inset)] mb-[var(--workspace-inset)] flex min-h-0 flex-1 flex-col overflow-hidden rounded-workspace border border-workspace-border bg-surface-workspace shadow-workspace outline-none max-md:mr-0 max-md:mb-0 max-md:rounded-none max-md:border-0 max-md:shadow-none"
    >
      {children}
    </main>
  )
}
