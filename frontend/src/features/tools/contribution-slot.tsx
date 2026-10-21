/**
 * A surface rendered *across* tools, assembled from the tools it may mount.
 *
 * Home's activity feed is one merged reading, but each row belongs to one tool
 * and must not be fetched for a principal who cannot open it. So the surface
 * mounts one contribution per openable tool, each contribution publishes what
 * it found, and the surface merges. Nothing fetches for a tool that never
 * mounted.
 *
 * Published items carry a `key` that stands for their content: the collector
 * keeps the previous array when the keys are unchanged, so a contribution may
 * publish on every render without looping.
 */
import { createContext, type ReactNode, use, useEffect, useReducer } from 'react'

export interface Keyed {
  /** Same key, same reading. */
  key: string
}

interface Publication<T> {
  from: string
  items: readonly T[]
}

type Published<T> = Readonly<Record<string, readonly T[]>>

const NOTHING: readonly never[] = []

function sameKeys(a: readonly Keyed[], b: readonly Keyed[]): boolean {
  return a.length === b.length && a.every((item, index) => item.key === b[index]?.key)
}

function publish<T extends Keyed>(state: Published<T>, action: Publication<T>): Published<T> {
  const current = state[action.from]
  if (current && sameKeys(current, action.items)) return state
  if (!current && action.items.length === 0) return state
  return { ...state, [action.from]: action.items }
}

export interface ContributionSlot<T extends Keyed> {
  Collector: (props: { children: (items: readonly T[]) => ReactNode }) => ReactNode
  useContribute: (from: string, items: readonly T[]) => void
}

export function createContributionSlot<T extends Keyed>(): ContributionSlot<T> {
  const PublishContext = createContext<((publication: Publication<T>) => void) | null>(null)

  function Collector({ children }: { children: (items: readonly T[]) => ReactNode }) {
    const [published, contribute] = useReducer<Published<T>, [Publication<T>]>(publish, {})
    return (
      <PublishContext value={contribute}>
        {children(Object.values(published).flat())}
      </PublishContext>
    )
  }

  function useContribute(from: string, items: readonly T[]) {
    const contribute = use(PublishContext)
    // No dependency list: `items` is rebuilt each render and the reducer
    // decides whether anything changed.
    useEffect(() => {
      contribute?.({ from, items })
    })
    // Withdrawing is keyed only on stable values, so it runs on unmount alone.
    useEffect(
      () => () => contribute?.({ from, items: NOTHING as readonly T[] }),
      [contribute, from],
    )
  }

  return { Collector, useContribute }
}
