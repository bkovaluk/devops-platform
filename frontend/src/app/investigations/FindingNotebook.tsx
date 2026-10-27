/**
 * The investigation as a notebook: one entry per call the agent made, in
 * order, on one thread, each led by what the call did to a hypothesis, with
 * what the agent read off it written underneath.
 *
 * Inputs only: what a call returned is never stored, so an entry offers its
 * arguments, and for an AWS read the CLI command that asks it again. Evidence
 * no step holds came from the context the agent was handed before it started,
 * and is written up after the steps rather than given a step it never had.
 *
 * The last row says how the run ended: whether the agent reported, why it
 * stopped, and the readings it stopped at, with the limit that forced it
 * marked. With a hypothesis in focus every step it does not cite dims.
 */
import { Braces, Check, Minus, X } from 'lucide-react'
import { Chip, type ChipTone } from '@/components/ui/chip'
import { CopyButton } from '@/components/ui/copy-button'
import { InfoTerm, InfoTip } from '@/components/ui/hint'
import { Panel } from '@/components/ui/panel'
import { SECTION_HEAD_GAP, SectionHeader } from '@/components/ui/section-header'
import {
  argLines,
  awsCliCommand,
  hypothesisId,
  isLookup,
  NO_CITATIONS,
  type StepCitations,
  stepRowId,
  stepSubject,
  stepToolLabel,
} from '@/features/findings/findings-reasoning'
import {
  compactTokens,
  formatDuration,
  type RunEnding,
  type RunMetric,
  runEnding,
} from '@/features/findings/findings-run'
import { HYPOTHESIS_NOTE } from '@/features/findings/findings-words'
import { cn } from '@/lib/utils'
import type { Evidence, Hypothesis, HypothesisState, RunSummary, ToolTrailStep } from '@/types/api'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

/** The marker, the call and its controls in one line; what was read off the
 *  call sits under it. */
const ENTRY_GRID = 'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3'

const MARKER =
  'relative z-[1] flex h-6 w-6 items-center justify-center rounded-full font-mono text-nano tabular-nums'

/** What a step did to a hypothesis, drawn so the three read apart without
 *  their colour: a fill, an outline, a dashed outline. */
const VERDICT: Readonly<Record<HypothesisState, string>> = {
  likely: 'bg-state-ok-fill font-medium text-state-ok',
  ruled_out: 'border border-input text-muted-foreground',
  unverified: 'border border-dashed border-input text-muted-foreground',
}

const ENDING: Readonly<
  Record<RunEnding['tone'], { marker: string; icon: typeof Check; chip: ChipTone }>
> = {
  ok: { marker: 'bg-state-ok-fill text-state-ok', icon: Check, chip: 'ok' },
  warn: { marker: 'bg-state-warn-fill text-state-warn', icon: Minus, chip: 'warn' },
  bad: { marker: 'bg-state-bad-fill text-state-bad', icon: X, chip: 'bad' },
}

/** Facts written up as one inset block, a hairline between each. */
function EvidenceBlock({ evidence, label }: { evidence: readonly Evidence[]; label: string }) {
  return (
    <Panel asChild tone="well" pad="none">
      <ul aria-label={label} className="divide-y divide-shell-separator">
        {evidence.map((item, index) => (
          <li key={index} className="px-2.5 py-2 text-xs leading-5 text-muted-foreground">
            {item.kind && (
              <span className="mr-2 font-mono text-nano text-dim-foreground">{item.kind}</span>
            )}
            {item.detail}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** A step's arguments, behind a press: the agent's input, redacted and cut. */
function Arguments({ step, number }: { step: ToolTrailStep; number: number }) {
  const lines = argLines(step.args)
  if (lines.length === 0) return null
  const cli = awsCliCommand(step)
  return (
    <InfoTip
      heading={`Arguments of step ${number}`}
      side="bottom"
      align="end"
      footer={
        cli && (
          <span className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-nano">{cli}</code>
            <CopyButton value={cli} label="Copy the CLI command" size="xs" />
          </span>
        )
      }
      trigger={
        // A plain button: a hint would take the anchor the panel is placed against.
        <button
          type="button"
          aria-label={`Arguments of step ${number}`}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground',
            FOCUS,
          )}
        >
          <Braces aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      }
    >
      <span className="flex flex-col gap-1 font-mono text-nano leading-4">
        {lines.map(([key, value]) => (
          <span key={key} className="flex min-w-0 gap-1.5">
            <span className="shrink-0 text-dim-foreground">{`${key}:`}</span>
            <span className="min-w-0 break-all whitespace-pre-wrap">{value}</span>
          </span>
        ))}
      </span>
    </InfoTip>
  )
}

function Verdicts({
  step,
  cited,
  hypotheses,
  focused,
  onFocus,
}: {
  step: ToolTrailStep
  cited: StepCitations
  hypotheses: readonly Hypothesis[]
  focused: number | null
  onFocus: (index: number) => void
}) {
  const refused = step.call?.refused
  if (refused) {
    return (
      <Chip tone="warn" soft hint={refused}>
        Blocked
      </Chip>
    )
  }
  // A lookup reads no live system, so it neither tests a hypothesis nor fails as evidence.
  if (isLookup(step)) return null
  if (step.status === 'empty' || step.status === 'error') {
    return (
      <span
        className={cn(
          'text-xs',
          step.status === 'error' ? 'text-state-bad' : 'text-dim-foreground',
        )}
      >
        {step.status === 'error' ? 'Error' : 'Empty'}
      </span>
    )
  }
  return (
    <>
      {cited.hypotheses.map((index) => {
        const hypothesis = hypotheses[index]
        if (!hypothesis) return null
        return (
          <button
            key={index}
            type="button"
            aria-pressed={focused === index}
            onClick={() => onFocus(index)}
            className={cn(
              'rounded-md px-2 py-0.5 text-xs whitespace-nowrap transition-colors duration-[var(--duration-fast)] hover:text-foreground',
              FOCUS,
              VERDICT[hypothesis.state],
              focused === index && 'underline underline-offset-4',
            )}
          >
            {`${HYPOTHESIS_NOTE[hypothesis.state]} ${hypothesisId(index)}`}
          </button>
        )
      })}
    </>
  )
}

interface EntryProps {
  step: ToolTrailStep
  number: number
  cited: StepCitations
  hypotheses: readonly Hypothesis[]
  focused: number | null
  onFocus: (index: number) => void
  highlighted: boolean
  dimmed: boolean
}

function Entry({
  step,
  number,
  cited,
  hypotheses,
  focused,
  onFocus,
  highlighted,
  dimmed,
}: EntryProps) {
  const tool = stepToolLabel(step)
  const subject = stepSubject(step)
  const lookup = isLookup(step)
  const quiet = !lookup && (step.status === 'empty' || step.status === 'error')
  return (
    <li
      id={stepRowId(number)}
      tabIndex={-1}
      aria-label={`Step ${number}`}
      data-dimmed={dimmed || undefined}
      data-highlighted={highlighted || undefined}
      className={cn(
        '-mx-1.5 rounded-md px-1.5 py-2.5 outline-none transition-[background-color,opacity] duration-[var(--duration)]',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal',
        highlighted && 'bg-accent',
        dimmed && 'opacity-35',
      )}
    >
      <div className={ENTRY_GRID}>
        <span
          aria-hidden="true"
          className={cn(
            MARKER,
            lookup && 'border border-input bg-panel text-dim-foreground',
            quiet && 'border border-dashed border-input bg-panel text-dim-foreground',
            !lookup && !quiet && 'bg-accent text-muted-foreground',
          )}
        >
          {number}
        </span>
        <span className="flex min-w-0 flex-col gap-1.5 pt-0.5">
          <span className="flex min-w-0 items-baseline gap-2.5">
            <span
              className={cn(
                'shrink-0 font-mono text-label',
                quiet || lookup ? 'text-muted-foreground' : 'font-semibold text-foreground',
              )}
            >
              {tool.prefix && (
                <span className="font-normal text-muted-foreground">{tool.prefix}</span>
              )}
              {tool.name}
            </span>
            {subject && (
              <span className="min-w-0 truncate font-mono text-xs text-dim-foreground">
                {subject}
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 empty:hidden">
            <Verdicts
              step={step}
              cited={cited}
              hypotheses={hypotheses}
              focused={focused}
              onFocus={onFocus}
            />
          </span>
          {cited.evidence.length > 0 && (
            <EvidenceBlock evidence={cited.evidence} label={`Read off step ${number}`} />
          )}
        </span>
        <Arguments step={step} number={number} />
      </div>
    </li>
  )
}

function Ending({
  run,
  outcome,
  calls,
  tokens,
}: {
  run: RunSummary
  outcome: string | null | undefined
  calls: number | null | undefined
  tokens: number | null | undefined
}) {
  const ending = runEnding(run, outcome)
  const look = ENDING[ending.tone]
  const Icon = look.icon
  const readings: { metric: RunMetric | null; text: string; hint: string | null }[] = [
    {
      metric: 'turns',
      text: `${run.turns ?? 0} of ${run.max_turns ?? 0} turns`,
      hint: 'Model replies. One reply can make several calls; the run stops at the turn limit.',
    },
    ...(typeof calls === 'number'
      ? [
          {
            metric: null,
            text: `${calls} ${calls === 1 ? 'call' : 'calls'}`,
            hint: 'Tool calls, one per notebook step.',
          },
        ]
      : []),
    { metric: 'duration', text: formatDuration(run.duration_seconds ?? 0), hint: null },
    {
      metric: 'tokens',
      text: `${compactTokens(run.weighted_tokens ?? 0)} of ${compactTokens(run.token_budget ?? 0)} budget`,
      hint:
        typeof tokens === 'number'
          ? `${compactTokens(tokens)} tokens processed; cached reads count for less toward the budget.`
          : 'Tokens weighted by cost, as the budget counts them.',
    },
  ]
  return (
    <li
      aria-label="Run ended"
      className={cn(
        ENTRY_GRID,
        'relative z-[1] mt-3 gap-y-1 border-t border-dashed border-input bg-panel pt-3 pb-2',
      )}
    >
      <span aria-hidden="true" className={cn(MARKER, 'rounded-md', look.marker)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="col-span-2 flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-foreground">{ending.outcomeWord}</span>
          <Chip tone={look.chip} soft>
            {ending.reasonLabel}
          </Chip>
          <span className="text-xs text-muted-foreground">{ending.sentence}</span>
        </span>
        <span className="flex flex-wrap gap-x-1.5 font-mono text-nano tabular-nums text-dim-foreground">
          {readings.map((reading, index) => {
            const limit = reading.metric !== null && reading.metric === ending.highlight
            const marked = cn(limit && 'text-state-warn')
            return (
              <span key={reading.text} className="contents">
                {index > 0 && <span aria-hidden="true">·</span>}
                {reading.hint ? (
                  <InfoTip
                    trigger={
                      <InfoTerm data-limit={limit || undefined} className={marked}>
                        {reading.text}
                      </InfoTerm>
                    }
                  >
                    {reading.hint}
                  </InfoTip>
                ) : (
                  <span data-limit={limit || undefined} className={marked}>
                    {reading.text}
                  </span>
                )}
              </span>
            )
          })}
        </span>
      </span>
    </li>
  )
}

interface NotebookProps {
  steps: readonly ToolTrailStep[]
  citations: ReadonlyMap<number, StepCitations>
  /** Evidence no step on the trail holds. */
  context: readonly Evidence[]
  /** In reading order, so a verdict names each by its id. */
  hypotheses: readonly Hypothesis[]
  focused: number | null
  onFocus: (index: number) => void
  /** The step a jump just brought the reader to. */
  highlighted: number | null
  outcome: string | null | undefined
  run: RunSummary | null | undefined
  calls: number | null | undefined
  tokens: number | null | undefined
}

export function FindingNotebook({
  steps,
  citations,
  context,
  hypotheses,
  focused,
  onFocus,
  highlighted,
  outcome,
  run,
  calls,
  tokens,
}: NotebookProps) {
  const stopped = !run && outcome === 'incomplete'
  if (steps.length === 0 && context.length === 0 && !run && !stopped) return null
  return (
    <section aria-labelledby="finding-notebook">
      <SectionHeader
        layout="page"
        id="finding-notebook"
        title="Notebook"
        description="Every call the agent made, in order. What a call returned is never kept."
        aside={`${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`}
        className={SECTION_HEAD_GAP}
      />
      {(steps.length > 0 || run || stopped) && (
        <ol
          aria-label="Notebook"
          className="relative flex flex-col before:absolute before:top-5 before:bottom-5 before:left-[11.5px] before:w-px before:bg-shell-separator"
        >
          {steps.map((step, index) => {
            const number = step.step ?? index + 1
            const cited = citations.get(number) ?? NO_CITATIONS
            return (
              <Entry
                key={`${index}:${number}`}
                step={step}
                number={number}
                cited={cited}
                hypotheses={hypotheses}
                focused={focused}
                onFocus={onFocus}
                highlighted={highlighted === number}
                dimmed={focused !== null && !cited.hypotheses.includes(focused)}
              />
            )
          })}
          {stopped && (
            <li aria-label="Stopped" className={cn(ENTRY_GRID, 'mt-1 py-2')}>
              <span
                aria-hidden="true"
                className={cn(MARKER, 'border border-dashed border-input bg-panel')}
              />
              <p className="col-span-2 text-xs text-dim-foreground">
                {`Stopped after ${steps.length} ${steps.length === 1 ? 'step' : 'steps'} without a conclusion.`}
              </p>
            </li>
          )}
          {run && <Ending run={run} outcome={outcome} calls={calls} tokens={tokens} />}
        </ol>
      )}
      {context.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <h3 className="text-xs text-muted-foreground">From the context bundle</h3>
          <EvidenceBlock evidence={context} label="From the context bundle" />
        </div>
      )}
    </section>
  )
}
