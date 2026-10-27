/**
 * How a finding's reasoning hangs together: the hypotheses in the order they
 * are read, what cites each trail step, and how a step names what it called.
 *
 * A step is described by the call descriptor the agent stored with it
 * (`provider.service.action` and a subject), never by interpreting a tool's
 * own arguments; a step stored before the agent described its calls falls
 * back to the tool's name and its first argument.
 */
import type { CheckedFact, Evidence, FindingDetail, Hypothesis, ToolTrailStep } from '@/types/api'
import { HYPOTHESIS_ORDER } from './findings-words'

/** The hypotheses in reading order, each state's in the order the agent gave. */
export function orderedHypotheses(finding: Pick<FindingDetail, 'hypotheses'>): Hypothesis[] {
  return HYPOTHESIS_ORDER.flatMap((state) =>
    finding.hypotheses.filter((hypothesis) => hypothesis.state === state),
  )
}

/** The steps the trail holds, so a citation is only offered where it lands. */
export function trailSteps(trail: readonly ToolTrailStep[]): ReadonlySet<number> {
  return new Set(trail.flatMap((step) => (typeof step.step === 'number' ? [step.step] : [])))
}

/** The steps the trail holds that a hypothesis or a checked fact cites, each
 *  once, in order. */
export function citedSteps(cited: Hypothesis | CheckedFact, known: ReadonlySet<number>): number[] {
  return [...new Set(cited.steps)].filter((step) => known.has(step)).sort((a, b) => a - b)
}

/** The id a trail step's row is reached by. */
export function stepRowId(step: number): string {
  return `finding-step-${step}`
}

/** The name a hypothesis goes by on the page: `H1` for the first one read. */
export function hypothesisId(index: number): string {
  return `H${index + 1}`
}

/** What cites one trail step: the evidence read off it, and the hypotheses it
 *  bears on, each by its place in reading order. */
export interface StepCitations {
  evidence: readonly Evidence[]
  hypotheses: readonly number[]
}

export const NO_CITATIONS: StepCitations = { evidence: [], hypotheses: [] }

/** What cites each step the trail holds. A step named twice by the same item
 *  is cited by it once; a step the trail never kept is cited by nothing. */
export function citationsByStep(finding: FindingDetail): ReadonlyMap<number, StepCitations> {
  const known = trailSteps(finding.tool_trail)
  const evidence = new Map<number, Evidence[]>()
  const hypotheses = new Map<number, number[]>()
  orderedHypotheses(finding).forEach((hypothesis, index) => {
    for (const step of new Set(hypothesis.steps)) {
      if (known.has(step)) hypotheses.set(step, [...(hypotheses.get(step) ?? []), index])
    }
  })
  for (const item of finding.evidence) {
    for (const step of new Set(item.steps)) {
      if (known.has(step)) evidence.set(step, [...(evidence.get(step) ?? []), item])
    }
  }
  return new Map(
    Array.from(new Set([...evidence.keys(), ...hypotheses.keys()]), (step) => [
      step,
      { evidence: evidence.get(step) ?? [], hypotheses: hypotheses.get(step) ?? [] },
    ]),
  )
}

/** The evidence no trail step holds: what the agent was handed before it
 *  started, or what cites only steps the trail did not keep. */
export function contextEvidence(
  finding: Pick<FindingDetail, 'evidence' | 'tool_trail'>,
): Evidence[] {
  const known = trailSteps(finding.tool_trail)
  return finding.evidence.filter((item) => !item.steps.some((step) => known.has(step)))
}

/** A step that looked something up rather than read a live system. */
export function isLookup(step: Pick<ToolTrailStep, 'call'>): boolean {
  return step.call?.kind === 'lookup'
}

/** The name a step's tool goes by: its call's `<service>.<action>` under the
 *  provider, written apart; otherwise the tool itself. */
export function stepToolLabel(step: Pick<ToolTrailStep, 'tool' | 'call'>): {
  prefix: string | null
  name: string
} {
  if (isLookup(step)) return { prefix: null, name: 'lookup' }
  if (step.call) {
    return { prefix: `${step.call.provider}.`, name: `${step.call.service}.${step.call.action}` }
  }
  return { prefix: null, name: step.tool ?? 'unknown tool' }
}

/** What a step looked at: what its call names, else its first string argument. */
export function stepSubject(step: Pick<ToolTrailStep, 'args' | 'call'>): string | null {
  if (step.call) {
    const { subject } = step.call
    return subject && isLookup(step) ? `"${subject}"` : (subject ?? null)
  }
  const first = Object.values(step.args ?? {}).find(
    (value): value is string => typeof value === 'string' && value !== '',
  )
  return first ?? null
}

/** A step's arguments as `key: value` lines, nested values written as JSON. */
export function argLines(args: ToolTrailStep['args']): [string, string][] {
  if (!args) return []
  return Object.entries(args).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : JSON.stringify(value),
  ])
}

function kebab(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[_-]+/g, '-')
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** Services whose CLI command differs from their API name. */
const CLI_SERVICE: Readonly<Record<string, string>> = { s3: 's3api' }

/** An AWS call as the CLI command that makes it again: each parameter as its
 *  kebab-case flag, every value single-quoted, anything not a string as JSON.
 *  Only an AWS call whose parameters the trail kept has one. */
export function awsCliCommand(step: Pick<ToolTrailStep, 'args' | 'call'>): string | null {
  const params = step.args?.params
  if (!step.call || step.call.provider !== 'aws') return null
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null
  const flags = Object.entries(params as Record<string, unknown>).map(
    ([key, value]) =>
      `--${kebab(key)} ${shellQuote(typeof value === 'string' ? value : JSON.stringify(value))}`,
  )
  const service = CLI_SERVICE[step.call.service] ?? step.call.service
  return ['aws', service, kebab(step.call.action), ...flags].join(' ')
}
