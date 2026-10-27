/**
 * The keys Investigations answers to, behind a keyboard button and `?`.
 * A native popover on the hint module's `InfoTip`, so it stays until put away.
 */
import { Keyboard } from 'lucide-react'
import type { Ref } from 'react'
import { InfoTip } from '@/components/ui/hint'
import { Kbd } from '@/components/ui/kbd'

export interface Shortcut {
  keys: readonly string[]
  word: string
}

export function ShortcutsPopover({
  shortcuts,
  triggerRef,
}: {
  shortcuts: readonly Shortcut[]
  /** The trigger, so `?` can press it. */
  triggerRef?: Ref<HTMLButtonElement>
}) {
  return (
    <InfoTip
      heading="Keyboard shortcuts"
      side="bottom"
      align="end"
      trigger={
        // A plain button: a hint would take the anchor the panel is placed against.
        <button
          ref={triggerRef}
          type="button"
          aria-label="Keyboard shortcuts"
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <Keyboard aria-hidden="true" className="h-3.5 w-3.5" />
          <Kbd>?</Kbd>
        </button>
      }
    >
      <span className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
        {shortcuts.map((shortcut) => (
          <span key={shortcut.word} className="contents">
            <span className="flex items-center gap-1">
              {shortcut.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
            <span>{shortcut.word}</span>
          </span>
        ))}
      </span>
    </InfoTip>
  )
}
