import { Monitor, Moon, Sun } from 'lucide-react'
import { withViewTransition } from '@/lib/view-transition'
import { type Theme, useUIStore } from '@/stores/ui-store'
import { Hint } from './hint'

const MODES: readonly Theme[] = ['dark', 'light', 'system']
const ICONS = { dark: Moon, light: Sun, system: Monitor }
const LABELS = { dark: 'Dark', light: 'Light', system: 'System' }

/** Cycles Dark → Light → System, crossfading the whole shell between ramps. */
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const theme = useUIStore((state) => state.theme)
  const setTheme = useUIStore((state) => state.setTheme)
  const Icon = ICONS[theme]
  const next = () =>
    withViewTransition(() => setTheme(MODES[(MODES.indexOf(theme) + 1) % MODES.length] ?? 'dark'))

  return (
    <Hint label={collapsed ? `Theme: ${LABELS[theme]}` : undefined} side="right">
      <button
        type="button"
        onClick={next}
        aria-label={`Theme: ${LABELS[theme]}`}
        className="flex h-8 w-full items-center overflow-hidden rounded-md px-2.5 text-muted-foreground transition-[background-color,color] duration-[var(--duration)] hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <span className="ml-2.5 overflow-hidden text-sm whitespace-nowrap transition-opacity duration-[var(--duration)] ease-[var(--ease-standard)] starting:opacity-0">
            {LABELS[theme]}
          </span>
        )}
      </button>
    </Hint>
  )
}
