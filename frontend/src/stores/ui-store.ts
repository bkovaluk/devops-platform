/**
 * Client state that belongs to this browser and no server: the theme, whether
 * the rail is collapsed, and which overlays are open. Everything a link should
 * carry lives in the URL instead (TanStack Router search params).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light' | 'system'

interface UIState {
  theme: Theme
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  mobileNavOpen: boolean
  /** The assistant dock. Closed on every load. */
  assistantOpen: boolean
  setTheme: (theme: Theme) => void
  toggleSidebar: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setMobileNavOpen: (open: boolean) => void
  setAssistantOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      mobileNavOpen: false,
      assistantOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
    }),
    {
      // index.html reads this key before the first paint.
      name: 'platform-ui',
      partialize: (state) => ({ theme: state.theme, sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
)
