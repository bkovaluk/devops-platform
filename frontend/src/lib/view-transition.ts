import { flushSync } from 'react-dom'

/**
 * The element a route change swaps on its own: a list's detail column, the
 * inbox's list. A navigation that passes `viewTransition` animates it as the
 * `pane` transition in index.css while the rest of the page holds still.
 */
export const TRANSITION_PANE = '[view-transition-name:pane]'

/**
 * A coarse swap (switching the environment or the theme) as one crossfade.
 * Feature-detected and skipped under reduced motion, where the change simply
 * happens.
 */
export function withViewTransition(update: () => void): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof document.startViewTransition !== 'function') {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
