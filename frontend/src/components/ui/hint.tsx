/**
 * The app's two hints, and nothing else draws one.
 *
 * `Hint` names a control: a few words on hover or focus — on a control that
 * acts or is disabled, a short reason — and never anything to press.
 * `InfoTip` hands over the sentence behind a word on a click, a tap or Enter,
 * and stays until it is put away, so it can hold a short list or a link.
 *
 * Both are native popovers placed with CSS anchor positioning
 * (`lib/popover.ts`): in the top layer beside their trigger, with no portal.
 *
 * No native `title` anywhere: `hint-affordances.test.ts` refuses one.
 */
import { X } from 'lucide-react'
import * as React from 'react'
import {
  type Align,
  anchoredStyle,
  anchorName,
  placeWithoutAnchors,
  type Side,
  supportsAnchors,
  useComposedRef,
  useShownPopover,
} from '@/lib/popover'
import { cn } from '@/lib/utils'

/** Hover waits long enough that a pointer crossing a toolbar does not flash
 *  labels down it; once one has shown, its neighbours open at once. */
const HOVER_DELAY_MS = 400
const SKIP_DELAY_MS = 300
const GAP = 6

/* eslint-disable react-refresh/only-export-components --
 * Button refuses a write the same way a disabled control refuses a press;
 * one definition keeps the two alike. */
export const ACTIVATION_KEYS = ['Enter', ' ']

export function refusePress(event: React.SyntheticEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

export function refuseActivationKey(event: React.KeyboardEvent): void {
  if (ACTIVATION_KEYS.includes(event.key)) refusePress(event)
}
/* eslint-enable react-refresh/only-export-components */

function isDisabled(element: React.ReactElement): boolean {
  return (element.props as { disabled?: unknown }).disabled === true
}

/**
 * A disabled control with a reason to give. Native `disabled` takes it out of
 * the tab order and away from the pointer, so the reason would never open;
 * `aria-disabled` keeps it reachable, and every press is refused in the
 * capture phase the way `disabled` would have.
 */
function reachable(control: React.ReactElement): React.ReactElement {
  return React.cloneElement(control as React.ReactElement<Record<string, unknown>>, {
    disabled: undefined,
    'aria-disabled': true,
    onClickCapture: refusePress,
    onKeyDownCapture: refuseActivationKey,
  })
}

/** Which hints are open and when one last closed, shared so the skip delay
 *  reaches the neighbours. */
interface HintClock {
  open: Set<string>
  closedAt: number
}

function newClock(): HintClock {
  return { open: new Set(), closedAt: 0 }
}

function isWarm(clock: HintClock): boolean {
  return clock.open.size > 0 || Date.now() - clock.closedAt < SKIP_DELAY_MS
}

function noteClosed(clock: HintClock, id: string): void {
  if (clock.open.delete(id)) clock.closedAt = Date.now()
}

const HintClockContext = React.createContext<React.RefObject<HintClock>>({ current: newClock() })

/** Mounted once at the root: the delays are shared, or the skip never happens. */
export function HintProvider({ children }: { children: React.ReactNode }) {
  const clockRef = React.useRef(newClock())
  return <HintClockContext value={clockRef}>{children}</HintClockContext>
}

/** The props a hint or a menu sets on its trigger, beside the trigger's own. */
interface TriggerProps {
  ref?: React.Ref<HTMLElement>
  style?: React.CSSProperties
  popoverTarget?: string
  'aria-describedby'?: string
}

export interface HintProps {
  /** A few words. Without one nothing opens, so a call site with nothing to
   *  say this time needs no branch. */
  label: string | null | undefined
  /** The shortcut that does the same, drawn as a key after the label. */
  kbd?: string
  /** Lets a long label break over lines. */
  wrap?: boolean
  side?: Side
  align?: Align
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactElement
}

export function Hint({
  label,
  kbd,
  wrap = false,
  side = 'top',
  align = 'center',
  open,
  onOpenChange,
  children,
}: HintProps) {
  const clockRef = React.useContext(HintClockContext)
  const id = React.useId()
  const name = anchorName(id)
  const tipId = `${id}-hint`
  const [ownOpen, setOwnOpen] = React.useState(false)
  const timerRef = React.useRef<number | undefined>(undefined)
  // A focus that follows a press belongs to the press, not to a reader arriving.
  const pressedRef = React.useRef(false)
  const anchor = React.useRef<HTMLElement>(null)
  const tip = React.useRef<HTMLSpanElement>(null)
  const isOpen = open ?? ownOpen
  const shown = Boolean(label) && isOpen

  useShownPopover({ popover: tip, anchor, shown, side, align, gap: GAP })

  React.useEffect(() => () => window.clearTimeout(timerRef.current), [])

  // Hover, focus and a press on the trigger, and Escape while shown. Escape
  // puts the hint away before anything under it hears the key, so a sheet
  // with a hint open closes on the second press, not the first.
  React.useEffect(() => {
    const node = anchor.current
    if (!node || !label) return
    const clock = clockRef.current
    const setOpen = (next: boolean) => {
      window.clearTimeout(timerRef.current)
      if (next) clock.open.add(id)
      else noteClosed(clock, id)
      if (next === isOpen) return
      setOwnOpen(next)
      onOpenChange?.(next)
    }
    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      window.clearTimeout(timerRef.current)
      if (isWarm(clock)) setOpen(true)
      else timerRef.current = window.setTimeout(() => setOpen(true), HOVER_DELAY_MS)
    }
    const onPointerLeave = () => setOpen(false)
    const onPointerDown = () => {
      pressedRef.current = true
      setOpen(false)
    }
    const onFocusIn = () => {
      if (!pressedRef.current) setOpen(true)
    }
    const onFocusOut = () => {
      pressedRef.current = false
      setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    node.addEventListener('pointerenter', onPointerEnter)
    node.addEventListener('pointerleave', onPointerLeave)
    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('focusin', onFocusIn)
    node.addEventListener('focusout', onFocusOut)
    if (shown) window.addEventListener('keydown', onEscape, true)
    return () => {
      node.removeEventListener('pointerenter', onPointerEnter)
      node.removeEventListener('pointerleave', onPointerLeave)
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('focusin', onFocusIn)
      node.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('keydown', onEscape, true)
    }
  }, [clockRef, id, label, isOpen, shown, onOpenChange])

  // A hint that unmounts while open no longer holds its neighbours warm.
  React.useEffect(() => {
    const clock = clockRef.current
    return () => noteClosed(clock, id)
  }, [clockRef, id])

  // The trigger stays mounted with or without a label, so a label that
  // arrives with the data never swaps the control under the reader's focus.
  const trigger = label && isDisabled(children) ? reachable(children) : children
  const own = trigger.props as TriggerProps
  const ref = useComposedRef(own.ref, anchor)
  const wired = React.cloneElement(trigger as React.ReactElement<TriggerProps>, {
    ref,
    style: { ...own.style, anchorName: name },
    'aria-describedby': shown ? tipId : own['aria-describedby'],
  })

  return (
    <>
      {wired}
      {shown && (
        <span
          ref={tip}
          id={tipId}
          role="tooltip"
          popover="manual"
          style={anchoredStyle(name, side, align, GAP)}
          className={cn(
            'anchored popover-motion pointer-events-none rounded-md border border-tooltip-border bg-tooltip px-2 py-1',
            'text-xs font-medium text-tooltip-foreground shadow-overlay',
            wrap ? 'max-w-xs break-words whitespace-normal' : 'whitespace-nowrap',
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            {label}
            {kbd && (
              <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-tooltip-foreground/15 px-1 font-mono text-nano leading-none text-tooltip-foreground">
                {kbd}
              </kbd>
            )}
          </span>
        </span>
      )}
    </>
  )
}

export interface InfoTipProps {
  /** What is pressed to open it. It must be a button, so a keyboard reaches it. */
  trigger: React.ReactElement
  /** A bold first line: the word being explained. */
  heading?: string
  children: React.ReactNode
  /** One link or action under the body. */
  footer?: React.ReactNode
  side?: Side
  align?: Align
}

export function InfoTip({
  trigger,
  heading,
  children,
  footer,
  side = 'top',
  align = 'start',
}: InfoTipProps) {
  const id = React.useId()
  const name = anchorName(id)
  const panelId = `${id}-info`
  const headingId = `${id}-heading`
  const bodyId = `${id}-body`
  const panel = React.useRef<HTMLSpanElement>(null)
  const anchor = React.useRef<HTMLElement>(null)

  // An auto popover closes itself on Escape or a press outside. Opening hands
  // focus to the panel, so a reader starts at the heading; closing hands it
  // back to the trigger unless the press that closed it put it somewhere else.
  // A press inside the panel never reaches a row around the trigger.
  React.useEffect(() => {
    const node = panel.current
    if (!node) return
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'open') {
        if (anchor.current && !supportsAnchors()) {
          placeWithoutAnchors(node, anchor.current, side, align, GAP)
        }
        node.focus()
        return
      }
      const focused = document.activeElement
      if (!focused || focused === document.body || node.contains(focused)) anchor.current?.focus()
    }
    const onClick = (event: MouseEvent) => event.stopPropagation()
    node.addEventListener('toggle', onToggle)
    node.addEventListener('click', onClick)
    return () => {
      node.removeEventListener('toggle', onToggle)
      node.removeEventListener('click', onClick)
    }
  }, [side, align])

  const own = trigger.props as TriggerProps
  const ref = useComposedRef(own.ref, anchor)
  const wired = React.cloneElement(trigger as React.ReactElement<TriggerProps>, {
    ref,
    style: { ...own.style, anchorName: name },
    popoverTarget: panelId,
  })

  return (
    <>
      {wired}
      {/* Spans throughout: the panel sits beside its trigger, which may be a
          word inside a paragraph. */}
      <span
        ref={panel}
        id={panelId}
        popover="auto"
        role="dialog"
        tabIndex={-1}
        aria-labelledby={heading ? headingId : undefined}
        aria-describedby={bodyId}
        style={anchoredStyle(name, side, align, GAP)}
        className={cn(
          'anchored popover-motion w-max max-w-[min(320px,calc(100vw-32px))] rounded-xl border border-border',
          'bg-popover py-3 pr-9 pl-3.5 text-left text-xs leading-5 text-popover-foreground shadow-overlay outline-none',
        )}
      >
        {heading && (
          <span id={headingId} className="mb-1 block text-xs font-semibold text-foreground">
            {heading}
          </span>
        )}
        <span id={bodyId} className="block text-muted-foreground">
          {children}
        </span>
        {footer && <span className="mt-2.5 block">{footer}</span>}
        <button
          type="button"
          aria-label="Close"
          onClick={() => panel.current?.hidePopover()}
          className="absolute top-2 right-2 inline-grid h-6 w-6 place-items-center rounded text-dim-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </span>
    </>
  )
}

/** A word in running text that opens an `InfoTip`, with the dotted rule that
 *  says there is a sentence behind it. */
export function InfoTerm({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'cursor-help underline decoration-dotted underline-offset-[3px]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
        className,
      )}
      {...props}
    />
  )
}
