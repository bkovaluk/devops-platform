/**
 * The credential this tab sends, and how many times the tab has changed hands.
 *
 * The backend reads `Authorization: Bearer <token>`. Locally it runs with
 * `AUTH_MODE=dev` and accepts any request, so a token is optional there:
 * `VITE_DEV_TOKEN` seeds one, and the sign-in page installs one a deployment
 * issued. It lives in `sessionStorage`, one tab at a time.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  /** Counts every sign-in and sign-out in this tab. Work started under one
   *  generation is refused under the next. */
  generation: number
  signIn: (token: string) => void
  signOut: () => void
}

const DEV_TOKEN = (import.meta.env.VITE_DEV_TOKEN as string | undefined) || null

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: DEV_TOKEN,
      generation: 0,
      signIn: (token) =>
        set((state) =>
          state.token === token ? state : { token, generation: state.generation + 1 },
        ),
      signOut: () => set((state) => ({ token: null, generation: state.generation + 1 })),
    }),
    {
      name: 'platform-auth',
      partialize: (state) => ({ token: state.token }),
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
