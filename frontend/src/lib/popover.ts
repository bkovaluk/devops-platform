/**
 * Native popovers placed against the element that opened them.
 *
 * A popover (the `popover` attribute) is drawn in the top layer, so no
 * ancestor's transform, overflow or stacking context can clip or misplace it,
 * and it needs no portal. CSS anchor positioning puts it beside its anchor:
 * `position-area` names the side and the alignment, a margin keeps the gap,
 * and `position-try-fallbacks` moves it when the first placement has no room.
 * A browser without anchor positioning gets the same placement, measured as
 * it opens.
 *
 * The `.anchored` class (index.css) clears the user-agent centring a popover
 * starts with; `.popover-motion` gives it its entry and exit.
 */
import { type CSSProperties, type Ref, type RefObject, useLayoutEffect } from 'react'

export type Side = 'top' | 'right' | 'bottom' | 'left'
export type Align = 'start' | 'center' | 'end'

const AREA: Record<Side, Record<Align, string>> = {
  top: { start: 'top span-right', center: 'top', end: 'top span-left' },
  bottom: { start: 'bottom span-right', center: 'bottom', end: 'bottom span-left' },
  left: { start: 'left span-bottom', center: 'left', end: 'left span-top' },
  right: { start: 'right span-bottom', center: 'right', end: 'right span-top' },
}

const GAP: Record<Side, 'marginBottom' | 'marginTop' | 'marginRight' | 'marginLeft'> = {
  top: 'marginBottom',
  bottom: 'marginTop',
  left: 'marginRight',
  right: 'marginLeft',
}

/** What is tried when the first placement overflows: the other side, then —
 *  for a centred box near an edge — the `@position-try` rules in index.css
 *  that slide it along its side. */
const FALLBACKS: Record<Side, Record<Align, string>> = {
  top: {
    start: 'flip-block, flip-inline',
    center: 'flip-block, --top-start, --top-end',
    end: 'flip-block, flip-inline',
  },
  bottom: {
    start: 'flip-block, flip-inline',
    center: 'flip-block, --bottom-start, --bottom-end',
    end: 'flip-block, flip-inline',
  },
  left: { start: 'flip-inline', center: 'flip-inline', end: 'flip-inline' },
  right: { start: 'flip-inline', center: 'flip-inline', end: 'flip-inline' },
}

/** Keeps a measured popover this far inside the viewport. */
const VIEWPORT_MARGIN = 8

/** A dashed ident for `anchor-name`, unique to one React id. */
export function anchorName(id: string): string {
  return `--anchor${id.replace(/[^\w-]/g, '')}`
}

export function supportsAnchors(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('anchor-name', '--probe')
    : false
}

/** The style that places a popover beside the anchor named `name`. */
export function anchoredStyle(name: string, side: Side, align: Align, gap: number): CSSProperties {
  return {
    positionAnchor: name,
    positionArea: AREA[side][align],
    positionTryFallbacks: FALLBACKS[side][align],
    [GAP[side]]: gap,
  }
}

/** The same placement, measured, for a browser without anchor positioning. */
export function placeWithoutAnchors(
  popover: HTMLElement,
  anchor: Element,
  side: Side,
  align: Align,
  gap: number,
): void {
  const a = anchor.getBoundingClientRect()
  const p = popover.getBoundingClientRect()
  const along = (start: number, size: number, length: number) =>
    align === 'start'
      ? start
      : align === 'end'
        ? start + size - length
        : start + (size - length) / 2
  const vertical = side === 'top' || side === 'bottom'
  const top = vertical
    ? side === 'top'
      ? a.top - p.height - gap
      : a.bottom + gap
    : along(a.top, a.height, p.height)
  const left = vertical
    ? along(a.left, a.width, p.width)
    : side === 'left'
      ? a.left - p.width - gap
      : a.right + gap
  const clamp = (value: number, length: number, room: number) =>
    Math.min(
      Math.max(VIEWPORT_MARGIN, value),
      Math.max(VIEWPORT_MARGIN, room - length - VIEWPORT_MARGIN),
    )
  popover.style.top = `${clamp(top, p.height, window.innerHeight)}px`
  popover.style.left = `${clamp(left, p.width, window.innerWidth)}px`
}

interface ShownPopoverOptions {
  popover: RefObject<HTMLElement | null>
  anchor: RefObject<Element | null>
  /** Shown while true; hidden as soon as it turns false or the owner unmounts. */
  shown: boolean
  side: Side
  align: Align
  gap: number
  /** Changes when the anchor moves while the popover stays open. */
  at?: unknown
}

/** Holds a popover its owner opens and closes (`popover="manual"`) in step
 *  with `shown`. */
export function useShownPopover({
  popover,
  anchor,
  shown,
  side,
  align,
  gap,
  at,
}: ShownPopoverOptions): void {
  useLayoutEffect(() => {
    const node = popover.current
    if (!shown || !node) return
    node.showPopover()
    return () => node.hidePopover()
  }, [popover, shown])

  useLayoutEffect(() => {
    const node = popover.current
    const target = anchor.current
    if (!shown || !node || !target || supportsAnchors()) return
    placeWithoutAnchors(node, target, side, align, gap)
  }, [popover, anchor, shown, side, align, gap, at])
}

/** One ref for an element both its owner (`own`) and a wrapper (`held`) hold. */
export function useComposedRef<T>(
  own: Ref<T> | undefined,
  held: RefObject<T | null>,
): (node: T | null) => void {
  return (node) => {
    held.current = node
    if (typeof own === 'function') own(node)
    else if (own) own.current = node
  }
}
