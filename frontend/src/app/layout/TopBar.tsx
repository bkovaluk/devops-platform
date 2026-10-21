import { Menu, Search, Sparkles } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { Kbd } from '@/components/ui/kbd'
import { useAssistantAvailable } from '@/features/assistant/use-agent-status'
import { useConfig } from '@/features/config/use-config'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import { ASSISTANT_DOCK_ID, ASSISTANT_TOGGLE_ID } from './AssistantDock'
import { EnvSwitcher } from './EnvSwitcher'
import { MobileNav } from './Sidebar'
import { UserMenu } from './UserMenu'

export function TopBar() {
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen)
  const assistantOpen = useUIStore((state) => state.assistantOpen)
  const setAssistantOpen = useUIStore((state) => state.setAssistantOpen)
  const assistantAvailable = useAssistantAvailable()
  const appName = useConfig().data?.app_name ?? 'DevOps Platform'
  return (
    <header className="z-10 flex h-12 shrink-0 items-center gap-2 px-3">
      <IconButton
        label="Open navigation"
        icon={<Menu aria-hidden="true" className="h-4 w-4" />}
        className="md:hidden"
        onClick={() => setMobileNavOpen(true)}
      />
      <MobileNav appName={appName} />
      <EnvSwitcher />
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => useUIStore.getState().setCommandPaletteOpen(true)}
        aria-label="Search or jump to"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:w-[320px] sm:bg-well sm:px-3"
      >
        <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">Search or jump to…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
      </button>
      {assistantAvailable && (
        <IconButton
          id={ASSISTANT_TOGGLE_ID}
          label={assistantOpen ? 'Close assistant' : 'Open assistant'}
          aria-pressed={assistantOpen}
          aria-controls={ASSISTANT_DOCK_ID}
          className={cn('max-md:hidden', assistantOpen && 'bg-accent text-foreground')}
          icon={<Sparkles aria-hidden="true" className="h-4 w-4" />}
          onClick={() => setAssistantOpen(!assistantOpen)}
        />
      )}
      <UserMenu />
    </header>
  )
}
