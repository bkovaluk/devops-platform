/**
 * Looking at the platform through someone else's grants.
 *
 * An admin can ask the API to answer as another principal, which is how
 * support reproduces "I can't see the button" without borrowing an account.
 * The target rides on every request as `X-View-As`; the API honours it for
 * admins only and names the target back in `/auth/me` as `view_as`.
 *
 * A lens is for looking. Every control that changes something refuses while
 * one is on, and the API refuses the write too.
 *
 * The target lives in `sessionStorage`: it belongs to one tab for as long as
 * that tab is open, never to the machine.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ViewAsState {
  /** The email being viewed as, or null for your own access. */
  viewAs: string | null
  /** How many times the lens has changed in this tab. */
  generation: number
  setViewAs: (email: string | null) => void
}

export const useViewAsStore = create<ViewAsState>()(
  persist(
    (set) => ({
      viewAs: null,
      generation: 0,
      // Naming the target already on screen changes nothing and counts as nothing.
      setViewAs: (viewAs) =>
        set((state) =>
          state.viewAs === viewAs ? state : { viewAs, generation: state.generation + 1 },
        ),
    }),
    {
      name: 'platform-view-as',
      partialize: (state) => ({ viewAs: state.viewAs }),
      storage: {
        getItem: (name) => {
          const value = sessionStorage.getItem(name)
          return value ? JSON.parse(value) : null
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
    },
  ),
)

export const VIEW_AS_HEADER = 'X-View-As'

/** The lens as a version number, for code outside React. */
export function lensGeneration(): number {
  return useViewAsStore.getState().generation
}

/** Whether the shell may act at all. Every mutation affordance asks here. */
export function useWritesBlocked(): boolean {
  return useViewAsStore((state) => state.viewAs !== null)
}

/** What a refused mutation affordance says for itself. */
export const WRITES_BLOCKED_REASON = 'Leave view-as to act'
