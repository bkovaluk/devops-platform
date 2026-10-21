import * as domMatchers from '@testing-library/jest-dom/matchers'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, vi } from 'vite-plus/test'
import { useAuthStore } from '@/features/auth/auth-store'
import { resetThread } from '@/features/assistant/assistant-store'
import { useViewAsStore } from '@/features/auth/view-as'
import { queryClient } from '@/lib/query-client'
import { useUIStore } from '@/stores/ui-store'
import { resetDb } from './msw/db'
import { server } from './msw/node'
import { installPopoverPolyfill } from './popover-polyfill'

// A control with a reason to give stays reachable under `aria-disabled`
// (components/ui/hint.tsx), which jest-dom's `toBeEnabled` does not read.
// These two read both, so a test asks whether a press will act.
function unavailable(element: Element): boolean {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'
}

expect.extend({
  toBeActionable(received: Element) {
    const pass = !unavailable(received)
    return {
      pass,
      message: () => `expected ${received.outerHTML} ${pass ? 'not ' : ''}to act`,
    }
  },
  toBeUnavailable(received: Element) {
    const pass = unavailable(received)
    return {
      pass,
      message: () => `expected ${received.outerHTML} ${pass ? 'not ' : ''}to be unavailable`,
    }
  },
})

// jest-dom's own `vitest` entry types the Vitest 4 assertion shape, so the
// matchers are registered here and typed against the one Vite+ bundles. The
// type parameters must match Vitest's declaration exactly.
expect.extend(domMatchers)

declare module 'vite-plus/test' {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {
    /** Neither `disabled` nor `aria-disabled`: a press will act. */
    toBeActionable: () => R
    /** `disabled` or `aria-disabled`: a press will not act. */
    toBeUnavailable: () => R
  }
}

configure({ asyncUtilTimeout: 4_000 })

// jsdom lacks these; Base UI, cmdk and the theme hook reach for them.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia
window.scrollTo = () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
// The assistant's message scroller watches which turns are in view.
globalThis.IntersectionObserver ??= class {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
} as unknown as typeof IntersectionObserver
for (const [name, stand] of [
  ['scrollIntoView', vi.fn()],
  ['hasPointerCapture', () => false],
  ['setPointerCapture', () => {}],
  ['releasePointerCapture', () => {}],
] as const) {
  if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { value: stand })
}
// Hints, menus and the minute popover are native popovers.
installPopoverPolyfill()

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetDb()
  queryClient.clear()
  sessionStorage.clear()
  useViewAsStore.setState({ viewAs: null })
  useAuthStore.setState({ token: null })
  useUIStore.setState({ assistantOpen: false, commandPaletteOpen: false })
  resetThread()
})

afterAll(() => server.close())
