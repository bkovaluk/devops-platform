/**
 * jsdom has no Popover API. This stands in for the parts the app relies on,
 * with the browser's semantics, so tests run the same code paths a browser
 * does:
 *
 * - `showPopover`, `hidePopover`, `togglePopover`, each firing `toggle` with
 *   `oldState` / `newState`;
 * - a closed popover out of view, so role queries skip it, and an open one
 *   in view;
 * - `popovertarget` / `popovertargetaction` invokers;
 * - light dismiss of `auto` popovers by a press outside or Escape, and an
 *   `auto` popover closing the others it is not inside;
 * - focus handed back to where it was when a popover that holds it closes.
 *
 * Placement is not modelled: jsdom does no layout.
 */
const OPEN = 'data-popover-open'
const shown: HTMLElement[] = []
const focusedBefore = new WeakMap<HTMLElement, Element | null>()

function isAuto(element: HTMLElement): boolean {
  const value = element.getAttribute('popover')
  return value === '' || value === 'auto'
}

function isShown(element: HTMLElement): boolean {
  return element.hasAttribute(OPEN)
}

function fireToggle(element: HTMLElement, oldState: string, newState: string): void {
  const event = new Event('toggle')
  Object.assign(event, { oldState, newState })
  element.dispatchEvent(event)
}

function show(element: HTMLElement): void {
  if (!element.hasAttribute('popover')) {
    throw new DOMException('Not a popover.', 'NotSupportedError')
  }
  if (isShown(element)) return
  if (!element.isConnected) throw new DOMException('Not connected.', 'InvalidStateError')
  if (isAuto(element)) {
    for (const other of [...shown].reverse()) {
      if (isAuto(other) && !other.contains(element)) hide(other)
    }
  }
  focusedBefore.set(element, document.activeElement)
  element.setAttribute(OPEN, '')
  shown.push(element)
  fireToggle(element, 'closed', 'open')
}

function hide(element: HTMLElement): void {
  if (!isShown(element)) return
  element.removeAttribute(OPEN)
  shown.splice(shown.indexOf(element), 1)
  if (element.contains(document.activeElement)) {
    const previous = focusedBefore.get(element)
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
  }
  fireToggle(element, 'open', 'closed')
}

function invokerOf(element: HTMLElement): Element | null {
  return element.id ? document.querySelector(`[popovertarget="${element.id}"]`) : null
}

export function installPopoverPolyfill(): void {
  if ('showPopover' in HTMLElement.prototype) return

  Object.defineProperties(HTMLElement.prototype, {
    showPopover: {
      value(this: HTMLElement) {
        show(this)
      },
    },
    hidePopover: {
      value(this: HTMLElement) {
        hide(this)
      },
    },
    togglePopover: {
      value(this: HTMLElement, force?: boolean) {
        const next = force ?? !isShown(this)
        if (next) show(this)
        else hide(this)
        return next
      },
    },
  })

  // jsdom's own sheet hides `[popover]:not(:popover-open)`, nothing it knows
  // of ever matches `:popover-open`, and its cascade weighs that rule by
  // specificity rather than origin, so showing the open state takes
  // `!important`.
  const style = document.createElement('style')
  style.textContent = `[popover][${OPEN}] { display: block !important; }`
  document.head.append(style)

  document.addEventListener('click', (event) => {
    const invoker = (event.target as Element | null)?.closest?.('[popovertarget]')
    if (!invoker || invoker.hasAttribute('disabled')) return
    const target = document.getElementById(invoker.getAttribute('popovertarget') ?? '')
    if (!target) return
    const action = invoker.getAttribute('popovertargetaction') ?? 'toggle'
    if (action === 'show') show(target)
    else if (action === 'hide') hide(target)
    else if (isShown(target)) hide(target)
    else show(target)
  })

  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as Node
      for (const element of [...shown].reverse()) {
        if (!isAuto(element)) continue
        if (element.contains(target)) return
        if (invokerOf(element)?.contains(target)) continue
        hide(element)
      }
    },
    true,
  )

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const top = [...shown].reverse().find(isAuto)
    if (top) hide(top)
  })
}
