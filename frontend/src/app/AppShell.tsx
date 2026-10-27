/**
 * The shell: the chrome (rail and top bar as one L), the workspace inset into
 * it, and the open tool inside. The shell names no tool: what it shows is the
 * registry filtered by the principal's grants.
 */
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useGrantRevocation, useScopes, useViewAsSession } from '@/features/auth/use-scopes'
import { useConfig } from '@/features/config/use-config'
import { shortcutsFor, toolForPath } from '@/features/tools/tool-registry'
import { useUIStore } from '@/stores/ui-store'
import { AppChrome, WorkspacePanel } from './layout/AppChrome'
import { AssistantDock } from './layout/AssistantDock'
import { EnvBanner } from './layout/EnvBanner'
import { EnvEdge } from './layout/EnvEdge'
import { pickForKey, pickRefusal, useChoosePick, usePicks } from './layout/env-pick'
import { Sidebar } from './layout/Sidebar'
import { SignInPage } from './layout/SignInPage'
import { TopBar } from './layout/TopBar'
import { ViewAsBanner } from './layout/ViewAsBanner'

const CommandPalette = lazy(() =>
  import('@/components/ui/command-palette').then((m) => ({ default: m.CommandPalette })),
)

/** Keys typed into a field belong to the field. */
function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function AppShell() {
  const grants = useScopes()
  useGrantRevocation()
  useViewAsSession()
  const { data: config } = useConfig()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const tool = toolForPath(pathname)
  const shortcuts = shortcutsFor(grants)
  const picks = usePicks()
  const choosePick = useChoosePick(tool)
  const appName = config?.app_name ?? 'DevOps Platform'

  useEffect(() => {
    document.title = tool.title ? `${tool.title} | ${appName}` : appName
  }, [tool, appName])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        useUIStore.getState().setCommandPaletteOpen(true)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || typingInto(event.target)) return
      const digit = Number(event.key)
      if (!Number.isInteger(digit) || digit < 1) return
      const path = shortcuts[digit - 1]
      if (path) void navigate({ to: path })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shortcuts, navigate])

  // ⌥0 picks every env and ⌥1 onwards the deployment's, by the physical key.
  // A pick the open tool cannot show is ignored, as its greyed menu item is.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
      if (typingInto(event.target)) return
      const pick = pickForKey(event.code, picks)
      if (pick === null) return
      event.preventDefault()
      if (pickRefusal(tool, pick, grants) === null) choosePick(pick)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [picks, tool, grants, choosePick])

  if (grants.status === 'signed-out') return <SignInPage appName={appName} />

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-foreground focus:shadow-overlay"
      >
        Skip to main content
      </a>
      <EnvEdge tool={tool} />
      <AppChrome rail={<Sidebar appName={appName} />} top={<TopBar tool={tool} />}>
        <div className="flex min-h-0 flex-1">
          <WorkspacePanel>
            <ViewAsBanner />
            <EnvBanner tool={tool} />
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">
              <ErrorBoundary key={tool.id} label={`${tool.label} view`}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </WorkspacePanel>
          <AssistantDock />
        </div>
        <ErrorBoundary label="Command palette">
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        </ErrorBoundary>
      </AppChrome>
    </>
  )
}
