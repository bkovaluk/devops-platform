/**
 * The words Investigations reads its values as, and the tone each one wears.
 *
 * One table per vocabulary, so the list, the detail and the close dialog say
 * the same thing about the same value. Health tones only: a severity is a
 * state, and the tool's own accent never colours one.
 */
import type { ChipTone } from '@/components/ui/chip'
import type { StateTone } from '@/components/ui/state-mark'
import type { FindingStatus, HypothesisState, Resolution } from '@/types/api'
import type { FacetKey } from './findings-search'

export const STATUS_WORD: Readonly<Record<FindingStatus, string>> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  closed: 'Closed',
}

const OUTCOME_WORD: Readonly<Record<string, string>> = {
  reported: 'Reported',
  incomplete: 'Incomplete',
  triaged: 'Triaged',
}

export const FACET_LABEL: Readonly<Record<FacetKey, string>> = {
  severity: 'Severity',
  outcome: 'Outcome',
  confidence: 'Confidence',
  effort: 'Effort',
  type: 'Type',
  kind: 'Kind',
  tool: 'Tool used',
  model: 'Model',
  resolution: 'Resolution',
  resolved_by: 'Reviewer',
}

export const HYPOTHESIS_WORD: Readonly<Record<HypothesisState, string>> = {
  likely: 'Likely',
  unverified: 'Unverified',
  ruled_out: 'Ruled out',
}

/** What a trail step is to a hypothesis it bears on, read off the state the
 *  agent left the hypothesis in. */
export const HYPOTHESIS_NOTE: Readonly<Record<HypothesisState, string>> = {
  likely: 'Supports',
  unverified: 'Tests',
  ruled_out: 'Rules out',
}

/** The order hypotheses are read in: the agent's answer, what it left open,
 *  then what it threw out. */
export const HYPOTHESIS_ORDER: readonly HypothesisState[] = ['likely', 'unverified', 'ruled_out']

/** The kinds the list leaves out unless asked: findings triage recorded
 *  without investigating, or folded into another finding. */
export const TRIAGE_KINDS: readonly string[] = ['skipped', 'deferred', 'linked', 'grouped', 'storm']

const KIND_WORD: Readonly<Record<string, string>> = {
  alarm: 'Alarm',
  incident: 'Incident',
  grouped: 'Grouped',
  linked: 'Linked',
  deferred: 'Deferred',
  skipped: 'Skipped',
  storm: 'Storm',
  has_linked: 'Has linked',
  repeating: 'Repeating',
}

export interface ResolutionMeaning {
  word: string
  /** What the reviewer is saying about the agent's answer. */
  meaning: string
  /** What the agent does with it afterwards. */
  learning: string
  /** Whether the agent reads it back on the next alarm on the resource. */
  remembered: boolean
}

export const RESOLUTION_MEANING: Readonly<Record<Resolution, ResolutionMeaning>> = {
  confirmed: {
    word: 'Confirmed',
    meaning: 'The cause was right.',
    learning: 'Agent memory and eval case',
    remembered: true,
  },
  false_positive: {
    word: 'False positive',
    meaning: 'The alarm fired, nothing was wrong.',
    learning: 'Agent memory and eval case',
    remembered: true,
  },
  wrong: {
    word: 'Wrong',
    meaning: 'Something was wrong, but not this. Needs a note.',
    learning: 'Eval case only, never shown to the agent',
    remembered: false,
  },
  dismissed: {
    word: 'Dismissed',
    meaning: 'Clears it from the queue.',
    learning: 'Not learned, never shown to the agent',
    remembered: false,
  },
}

/** The longest note the API keeps. */
export const NOTE_LIMIT = 500

/** Whether the agent reported a cause. A finding stored without an outcome
 *  counts as reported. */
export function isReported(outcome: string | null | undefined): boolean {
  return outcome === undefined || outcome === null || outcome === 'reported'
}

/** What a reviewer may say about a finding: nothing the agent never claimed
 *  can be confirmed. */
export function resolutionsFor(outcome: string | null | undefined): readonly Resolution[] {
  return isReported(outcome) ? ['confirmed', 'false_positive', 'wrong'] : ['dismissed']
}

export function noteRequired(resolution: Resolution): boolean {
  return resolution === 'wrong'
}

export function outcomeWord(outcome: string | null | undefined): string {
  return outcome ? (OUTCOME_WORD[outcome] ?? outcome) : 'Reported'
}

export function resolutionWord(resolution: string | null | undefined): string {
  if (!resolution) return 'Unresolved'
  return RESOLUTION_MEANING[resolution as Resolution]?.word ?? resolution
}

export function severityTone(severity: string | null | undefined): StateTone {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'bad'
    case 'medium':
      return 'warn'
    default:
      return 'unknown'
  }
}

export function resolutionTone(resolution: string | null | undefined): ChipTone {
  switch (resolution) {
    case 'confirmed':
      return 'ok'
    case 'wrong':
      return 'bad'
    case 'false_positive':
      return 'info'
    default:
      return 'neutral'
  }
}

/** A context section as one toned state: what the agent was handed before it
 *  started, read off the section's own status. */
export function contextTone(status: string): StateTone {
  if (status === 'available' || status === 'ok') return 'ok'
  if (status === 'error' || status === 'failed') return 'bad'
  if (status === 'truncated') return 'warn'
  return 'unknown'
}

/** How a facet value reads in its menu. */
export function facetWord(key: FacetKey, value: string): string {
  switch (key) {
    case 'outcome':
      return outcomeWord(value)
    case 'resolution':
      return resolutionWord(value)
    case 'kind':
      return KIND_WORD[value] ?? value
    case 'effort':
      return value.replace('_', ' ')
    default:
      return value
  }
}

/** A value the API gives in lower case, as a fact says it. */
export function sentenceCase(word: string): string {
  const spaced = word.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** How long ago, in the one unit that reads at a glance: `45m`, `3h`, `2d`. */
export function ageWord(at: string | null | undefined, now: number = Date.now()): string {
  if (!at) return 'unknown'
  const then = Date.parse(at)
  if (Number.isNaN(then)) return 'unknown'
  const minutes = Math.max(0, Math.floor((now - then) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** The short form a finding is named by where its whole id would crowd. */
export function shortId(findingId: string): string {
  return findingId.length > 14 ? findingId.slice(0, 12) : findingId
}

const DESTRUCTIVE = /\b(delete|purge|remove|terminate|drop|rm)\b/i

/** Whether a command reads as one that destroys something. A word list, not a
 *  parser: a destructive command spelled without one of these verbs goes
 *  unmarked. */
export function isDestructive(command: string): boolean {
  return DESTRUCTIVE.test(command)
}
