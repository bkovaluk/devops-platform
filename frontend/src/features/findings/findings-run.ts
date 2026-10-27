/**
 * How an investigation's run ended, as the notebook's closing row says it:
 * whether the agent reported, why it stopped, and which limit, if any, made
 * it stop.
 */
import type { StateTone } from '@/components/ui/state-mark'
import type { RunSummary } from '@/types/api'

/** The limit a forced stop ran into, so its reading can be marked. */
export type RunMetric = 'turns' | 'tokens' | 'duration'

export interface RunEnding {
  tone: Extract<StateTone, 'ok' | 'warn' | 'bad'>
  outcomeWord: 'Reported' | 'Incomplete'
  reasonLabel: string
  sentence: string
  highlight: RunMetric | null
}

const REASON_LABEL: Readonly<Record<string, string>> = {
  chose: 'Chose to stop',
  turn_limit: 'Turn limit',
  token_budget: 'Token budget',
  time: 'Out of time',
  no_report: 'No valid report',
  model_error: 'Model error',
}

const SENTENCE: Readonly<Record<string, string>> = {
  chose: 'Stopped on its own once the evidence held up.',
  turn_limit: 'Told on the last turn to report with what it had.',
  token_budget: 'Budget spent; the next turn had to report.',
  time: 'The time limit forced the final turn.',
  no_report: 'The final turn did not produce a valid report.',
  model_error: 'A model call failed.',
}

/** Where an incomplete run's sentence differs from a reported one's. */
const INCOMPLETE_SENTENCE: Readonly<Record<string, string>> = {
  chose: 'Stopped on its own without a valid report.',
  time: 'The time limit came before a valid report.',
}

const HIGHLIGHT: Readonly<Record<string, RunMetric>> = {
  turn_limit: 'turns',
  token_budget: 'tokens',
  time: 'duration',
}

export function runEnding(run: RunSummary, outcome: string | null | undefined): RunEnding {
  const reason = run.stop_reason ?? 'chose'
  const incomplete = outcome === 'incomplete'
  return {
    tone: incomplete ? 'bad' : reason === 'chose' ? 'ok' : 'warn',
    outcomeWord: incomplete ? 'Incomplete' : 'Reported',
    reasonLabel: REASON_LABEL[reason] ?? reason,
    sentence: (incomplete ? INCOMPLETE_SENTENCE[reason] : undefined) ?? SENTENCE[reason] ?? reason,
    highlight: HIGHLIGHT[reason] ?? null,
  }
}

/** A run's length as a reader says it: `45s`, `1m 10s`, `1h 2m`. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  if (minutes > 0) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
  return `${rest}s`
}

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact' })

/** A token count the short way a reader says it: `121K`, `1.5M`. */
export function compactTokens(tokens: number): string {
  return COMPACT.format(tokens)
}
