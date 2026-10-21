/**
 * One minute of a flag, opened from its strip: when, how many evaluations and
 * what share answered enabled, against the hour's median; one sentence where
 * the minute is worth one; and the change, if somebody made it in this minute.
 */
import { Chip } from '@/components/ui/chip'
import { StateMark } from '@/components/ui/state-mark'
import type { MinuteReading } from '@/features/flags/evaluations'
import type { Flag } from '@/types/api'

/** How far above the median a minute has to run before it is called busy. */
const BUSY_FACTOR = 2

function sentenceFor(minute: MinuteReading): string | null {
  if (minute.evaluations === 0) return 'Nothing evaluated this flag in this minute.'
  if (minute.median !== null && minute.evaluations > minute.median * BUSY_FACTOR) {
    return 'Busier than usual: more than twice the hour’s median.'
  }
  return null
}

export function MinutePopover({ minute, flag }: { minute: MinuteReading; flag: Flag }) {
  const sentence = sentenceFor(minute)
  const share = minute.enabledShare === null ? '—' : `${Math.round(minute.enabledShare * 100)}%`
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="mono min-w-0 truncate text-foreground">{flag.key}</h3>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {minute.at.slice(11, 16)} UTC
        </span>
        <Chip
          tone={minute.evaluations > 0 ? 'ok' : 'unknown'}
          soft
          className="ml-auto shrink-0 gap-1.5"
        >
          <StateMark tone={minute.evaluations > 0 ? 'ok' : 'unknown'} size="sm" mode="delegated" />
          {minute.evaluations > 0 ? 'Evaluated' : 'Quiet'}
        </Chip>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Reading label="Evaluations" value={minute.evaluations.toLocaleString()} />
        <Reading label="Enabled" value={share} />
        <Reading
          label="Median"
          value={minute.median === null ? '—' : Math.round(minute.median).toLocaleString()}
        />
      </dl>
      {sentence && <p className="text-xs text-muted-foreground">{sentence}</p>}
      {minute.changedHere && (
        <p className="flex items-center gap-2 text-xs">
          <span aria-hidden="true" className="h-3 w-px shrink-0 bg-foreground" />
          <span className="text-foreground">Changed by {flag.updated_by}</span>
        </p>
      )}
    </div>
  )
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-well px-2 py-1.5">
      <dt className="field-label">{label}</dt>
      <dd className="font-mono text-xs tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
