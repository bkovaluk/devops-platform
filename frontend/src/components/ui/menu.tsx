/**
 * A menu of a few actions under its trigger: a native popover (`popover="auto"`)
 * placed with CSS anchor positioning, so the browser owns light dismiss and
 * the top layer, and this module owns the menu's keyboard.
 *
 * Opened from the keyboard it focuses the checked item, else the first (the
 * last for ArrowUp); opened by a press it focuses itself, so nothing is
 * highlighted until the pointer or a key says so. The arrows, Home and End
 * walk the items, a letter jumps to the next item starting with it, and Tab
 * closes. Escape or a press outside closes and hands focus back to the
 * trigger, unless the press put it somewhere else. Choosing an item closes the
 * menu first, then acts, so an item that opens a dialog hands focus on cleanly.
 */
import * as React from 'react'
import {
  type Align,
  anchoredStyle,
  anchorName,
  placeWithoutAnchors,
  supportsAnchors,
  useComposedRef,
} from '@/lib/popover'
import { cn } from '@/lib/utils'

const GAP = 6
const ITEM_SELECTOR = '[role^="menuitem"]'

const CloseMenu = React.createContext<() => void>(() => {})

/** The props a menu wires onto its trigger, next to the trigger's own. */
interface TriggerProps {
  ref?: React.Ref<HTMLElement>
  id?: string
  style?: React.CSSProperties
  popoverTarget?: string
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: boolean
  'aria-controls'?: string
  onKeyDown?: (event: React.KeyboardEvent) => void
}

interface MenuProps {
  /** The control that opens the menu, a button; the menu is placed against it
   *  and named by it. */
  trigger: React.ReactElement
  align?: Exclude<Align, 'center'>
  className?: string
  children: React.ReactNode
}

function itemsOf(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
}

export function Menu({ trigger, align = 'start', className, children }: MenuProps) {
  const id = React.useId()
  const name = anchorName(id)
  const menuId = `${id}-menu`
  const triggerId = `${id}-trigger`
  const menu = React.useRef<HTMLDivElement>(null)
  const anchor = React.useRef<HTMLElement>(null)
  const [open, setOpen] = React.useState(false)
  // Where the key that opened the menu asked focus to land; a press asks nothing.
  const landOn = React.useRef<'first' | 'last' | null>(null)

  React.useEffect(() => {
    const node = menu.current
    if (!node) return
    const onToggle = (event: Event) => {
      const opened = (event as ToggleEvent).newState === 'open'
      setOpen(opened)
      if (opened) {
        if (anchor.current && !supportsAnchors()) {
          placeWithoutAnchors(node, anchor.current, 'bottom', align, GAP)
        }
        const items = itemsOf(node)
        const checked = items.find((item) => item.getAttribute('aria-checked') === 'true')
        const target =
          landOn.current === 'last'
            ? items.at(-1)
            : landOn.current === 'first'
              ? (checked ?? items[0])
              : node
        landOn.current = null
        target?.focus()
        return
      }
      landOn.current = null
      const focused = document.activeElement
      if (!focused || focused === document.body || node.contains(focused)) anchor.current?.focus()
    }
    node.addEventListener('toggle', onToggle)
    return () => node.removeEventListener('toggle', onToggle)
  }, [align])

  const close = () => menu.current?.hidePopover()

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    // Enter and Space press the trigger, which opens the menu natively.
    if (event.key === 'Enter' || event.key === ' ') landOn.current = 'first'
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    landOn.current = event.key === 'ArrowUp' ? 'last' : 'first'
    menu.current?.showPopover()
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = itemsOf(event.currentTarget)
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (index: number) => {
      event.preventDefault()
      items[Math.min(items.length - 1, Math.max(0, index))]?.focus()
    }
    if (event.key === 'ArrowDown') return move(at + 1)
    if (event.key === 'ArrowUp') return move(at < 0 ? items.length - 1 : at - 1)
    if (event.key === 'Home') return move(0)
    if (event.key === 'End') return move(items.length - 1)
    if (event.key === 'Tab') {
      event.preventDefault()
      close()
      return
    }
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return
    const letter = event.key.toLowerCase()
    const after = [...items.slice(at + 1), ...items.slice(0, at + 1)]
    const match = after.find((item) => item.textContent?.trim().toLowerCase().startsWith(letter))
    if (match) {
      event.preventDefault()
      match.focus()
    }
  }

  const own = trigger.props as TriggerProps
  const ref = useComposedRef(own.ref, anchor)
  const wired = React.cloneElement(trigger as React.ReactElement<TriggerProps>, {
    ref,
    id: triggerId,
    style: { ...own.style, anchorName: name },
    popoverTarget: menuId,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': menuId,
    onKeyDown: (event) => {
      own.onKeyDown?.(event)
      onTriggerKeyDown(event)
    },
  })

  return (
    <>
      {wired}
      <div
        ref={menu}
        id={menuId}
        popover="auto"
        role="menu"
        tabIndex={-1}
        aria-labelledby={triggerId}
        onKeyDown={onMenuKeyDown}
        style={anchoredStyle(name, 'bottom', align, GAP)}
        className={cn(
          'anchored popover-motion rounded-md border border-border bg-popover p-1 shadow-overlay outline-none',
          className,
        )}
      >
        <CloseMenu value={close}>{children}</CloseMenu>
      </div>
    </>
  )
}

interface MenuItemProps {
  onSelect: () => void
  /** Makes the item one of a set of choices, checked or not. */
  checked?: boolean
  /** Greyed and inert, but still in the menu and reachable, so the reason it
   *  carries can be read. */
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

export function MenuItem({ onSelect, checked, disabled, className, children }: MenuItemProps) {
  const close = React.useContext(CloseMenu)
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      onClick={() => {
        if (disabled) return
        close()
        onSelect()
      }}
      // The pointer and the keyboard share one highlight: focus.
      onPointerMove={(event) => {
        if (document.activeElement !== event.currentTarget) event.currentTarget.focus()
      }}
      className={cn(
        'flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground outline-none hover:bg-accent focus:bg-accent',
        'aria-disabled:cursor-not-allowed aria-disabled:text-dim-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** A labelled run of items: a set of choices, or one kind of action. */
export function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const labelId = React.useId()
  return (
    <div role="group" aria-labelledby={labelId}>
      <div id={labelId} className="px-2 pt-2 pb-1 text-xs font-medium text-dim-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}

export function MenuSeparator() {
  return <hr className="my-1 h-px border-0 bg-border" />
}
