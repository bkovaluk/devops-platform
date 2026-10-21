/**
 * Health as one dot: `md` 8px, `sm` 6px for dense rows. Colour comes only from
 * the state tokens. A coloured standing (ok, warn, bad) hands its word to the
 * dot's accessible name rather than printing it beside the dot, because a red
 * dot next to "Failed" says the same thing twice; `unknown` has no colour to
 * say it with and keeps its word visible.
 *
 * Inside a button or a link the mark is `delegated`: that control owns the
 * focus and the name.
 */
import { cn } from '@/lib/utils'

export type StateTone = 'ok' | 'warn' | 'bad' | 'unknown'

const SIZE = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2' } as const

const SOLID: Record<StateTone, string> = {
  ok: 'bg-state-ok',
  warn: 'bg-state-warn',
  bad: 'bg-state-bad',
  unknown: 'bg-state-unknown',
}

export interface StateMarkProps {
  tone: StateTone
  /** The one-word standing: "Enabled", "Pending". */
  word?: string
  mode?: 'standalone' | 'delegated'
  size?: keyof typeof SIZE
  className?: string
}

export function StateMark({
  tone,
  word,
  mode = 'standalone',
  size = 'md',
  className,
}: StateMarkProps) {
  const visibleWord = tone === 'unknown' && word !== undefined
  const box = cn('inline-flex shrink-0 items-center', visibleWord && 'gap-1.5', className)
  const dot = <span aria-hidden="true" className={cn(SIZE[size], 'rounded-full', SOLID[tone])} />

  if (mode === 'delegated') {
    return (
      <span aria-hidden="true" className={box}>
        {dot}
        {visibleWord && <span className="text-xs text-muted-foreground">{word}</span>}
      </span>
    )
  }
  return (
    <span role="img" aria-label={word ?? tone} className={box}>
      {dot}
      {visibleWord && (
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {word}
        </span>
      )}
    </span>
  )
}
