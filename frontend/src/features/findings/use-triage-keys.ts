/**
 * Single-key triage shortcuts for the Investigations tool.
 *
 * A key does nothing while the reader is typing, inside a dialog, a popover
 * or a menu, or under a modifier, so a letter typed into the close note, the
 * search or a menu's type-ahead never moves the page. A binding of `null` is
 * a key the page knows but cannot act on right now: it is left to the browser.
 */
import { useEffect, useRef } from 'react'

export type TriageBindings = Readonly<Record<string, (() => void) | null>>

const OVERLAY = '[popover], [role="dialog"], [role="alertdialog"], [role="menu"]'

/** Whether a keystroke belongs to something other than the page: a field
 *  being typed in, or an overlay that owns its own keys. */
function isClaimed(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
    return true
  }
  return target.closest(OVERLAY) !== null
}

export function useTriageKeys(bindings: TriageBindings): void {
  const current = useRef(bindings)
  useEffect(() => {
    current.current = bindings
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (isClaimed(event.target)) return
      const run = current.current[event.key]
      if (!run) return
      event.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
