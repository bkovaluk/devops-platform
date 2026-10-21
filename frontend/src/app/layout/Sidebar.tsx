/**
 * The rail: the wordmark, the tools the principal can open grouped as the
 * registry says, each tool's live count, and the theme at the foot. A
 * principal with no workspace gets no rows at all.
 */
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Link } from '@tanstack/react-router'
import { PanelLeft } from 'lucide-react'
import { OVERLAY_BACKDROP } from '@/components/ui/dialog'
import { Hint } from '@/components/ui/hint'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useScopes } from '@/features/auth/use-scopes'
import { navFor, type ToolDefinition, type ToolGroup } from '@/features/tools/tool-registry'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'

const GROUP_LABEL: Partial<Record<ToolGroup, string>> = {
  inbox: 'Inbox',
  tools: 'Tools',
}

const RAIL_ROW =
  'flex h-8 w-full items-center overflow-hidden rounded-sm text-left transition-[background-color,color] duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal'

function Wordmark({ appName }: { appName: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <img
        src="/mark.svg"
        alt=""
        aria-hidden="true"
        className="h-[18px] w-[18px] shrink-0 rounded-[4px]"
      />
      <span className="overflow-hidden font-display font-stretch-125% text-sm font-bold tracking-[-0.01em] whitespace-nowrap text-foreground transition-opacity duration-[var(--duration)] ease-[var(--ease-standard)] starting:opacity-0">
        {appName}
      </span>
    </span>
  )
}

function RailItem({
  tool,
  collapsed,
  shortcut,
  onNavigate,
}: {
  tool: ToolDefinition
  collapsed: boolean
  shortcut: number
  onNavigate?: () => void
}) {
  const Count = tool.contributions?.count
  const Icon = tool.icon
  const row = (
    <Link
      to={tool.path}
      activeOptions={{ exact: tool.path === '/', includeSearch: false }}
      onClick={onNavigate}
      aria-label={collapsed ? tool.label : undefined}
      className={cn(
        RAIL_ROW,
        collapsed ? 'justify-center px-0' : 'px-2.5',
        'text-muted-foreground hover:bg-card hover:text-foreground',
        'data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-foreground',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', isActive && tool.accent)} />
          {!collapsed && (
            <span className="ml-2.5 min-w-0 flex-1 truncate text-sm">{tool.label}</span>
          )}
          {!collapsed && Count && <Count />}
        </>
      )}
    </Link>
  )
  if (!collapsed) return row
  return (
    <Hint label={tool.label} kbd={String(shortcut)} side="right">
      {row}
    </Hint>
  )
}

function SidebarContent({
  appName,
  collapsed,
  onNavigate,
}: {
  appName: string
  collapsed: boolean
  onNavigate?: () => void
}) {
  const grants = useScopes()
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const nav = navFor(grants)
  const groups: ToolGroup[] = ['shell', 'inbox', 'tools']

  return (
    <>
      <div
        className={cn(
          'flex h-12 shrink-0 items-center',
          collapsed ? 'justify-center' : 'pr-2 pl-4',
        )}
      >
        {!collapsed && <Wordmark appName={appName} />}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className={cn(
            'shrink-0 rounded-sm p-1.5 text-dim-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
            !collapsed && 'ml-auto',
          )}
        >
          <PanelLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      <nav aria-label="Tools" className="flex flex-1 flex-col gap-1 px-1.5 py-1">
        {groups.map((group) => {
          const items = nav.filter((tool) => tool.group === group)
          if (items.length === 0) return null
          const label = GROUP_LABEL[group]
          return (
            <div key={group} className="flex flex-col gap-0.5">
              {label && !collapsed && (
                <span className="px-2.5 pt-4 pb-1 text-xs font-medium text-dim-foreground">
                  {label}
                </span>
              )}
              {label && collapsed && (
                <span aria-hidden="true" className="mx-3 my-2 h-px bg-shell-separator" />
              )}
              {items.map((tool) => (
                <RailItem
                  key={tool.id}
                  tool={tool}
                  collapsed={collapsed}
                  shortcut={nav.indexOf(tool) + 1}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )
        })}
      </nav>
      <div className={cn('pb-3', collapsed ? 'px-2' : 'px-1.5')}>
        <ThemeToggle collapsed={collapsed} />
      </div>
    </>
  )
}

/** Below `md` the rail is a drawer the top bar opens. */
export function MobileNav({ appName }: { appName: string }) {
  const open = useUIStore((state) => state.mobileNavOpen)
  const setOpen = useUIStore((state) => state.setMobileNavOpen)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={OVERLAY_BACKDROP} />
        <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-surface-chrome outline-none transition-[translate] duration-[var(--duration-slide)] ease-[var(--ease-slide)] starting:-translate-x-full data-ending-style:-translate-x-full">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <SidebarContent appName={appName} collapsed={false} onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Sidebar({ appName }: { appName: string }) {
  const collapsed = useUIStore((state) => state.sidebarCollapsed)
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-[var(--duration)] ease-[var(--ease-standard)]',
        collapsed ? 'w-14' : 'w-[220px]',
      )}
    >
      <SidebarContent appName={appName} collapsed={collapsed} />
    </aside>
  )
}
