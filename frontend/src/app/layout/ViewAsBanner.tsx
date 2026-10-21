/**
 * The lens, said under the top bar while it is on. Drawn from what the tab
 * asked for, not from what the API applied, so the Exit is on screen while the
 * answer is still coming and when it never comes.
 */
import { StateMark } from '@/components/ui/state-mark'
import { useScopes } from '@/features/auth/use-scopes'
import { useViewAsStore } from '@/features/auth/view-as'

export function ViewAsBanner() {
  const requested = useViewAsStore((state) => state.viewAs)
  const { viewAs, status } = useScopes()
  if (!requested) return null

  const verdict = viewAs
    ? `Viewing as ${viewAs} · read-only`
    : status === 'loading'
      ? `Viewing as ${requested} · checking access`
      : `Couldn't view as ${requested}`

  return (
    <div
      role="status"
      className="flex h-7 shrink-0 items-center gap-2 bg-state-warn-fill px-4 font-mono text-xs text-state-warn"
    >
      <StateMark tone="warn" size="sm" mode="delegated" />
      <span>{verdict}</span>
      <button
        type="button"
        onClick={() => useViewAsStore.getState().setViewAs(null)}
        className="rounded-sm underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-state-warn"
      >
        Exit
      </button>
    </div>
  )
}
