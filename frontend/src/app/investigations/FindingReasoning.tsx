/**
 * What the agent weighed and what it verified.
 *
 * Every hypothesis it named sits in the order a reviewer wants them: the one
 * it settled on, the ones it left open, the ones it ruled out, each under the
 * id the notebook calls it by, with the steps that cite it at the end of its
 * row. Pressing a row puts it in focus and the notebook dims every step it
 * does not cite; pressing a step number brings that step into view.
 *
 * What the agent checked stands apart: facts it verified on its own, each
 * with the steps it read them off.
 */
import { Check } from 'lucide-react'
import { Chip, type ChipTone } from '@/components/ui/chip'
import { SECTION_HEAD_GAP, SectionHeader } from '@/components/ui/section-header'
import { citedSteps, hypothesisId } from '@/features/findings/findings-reasoning'
import { HYPOTHESIS_WORD } from '@/features/findings/findings-words'
import { cn } from '@/lib/utils'
import type { CheckedFact, Hypothesis, HypothesisState } from '@/types/api'
import { FindingProse } from './FindingProse'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

const STATE_TONE: Readonly<Record<HypothesisState, ChipTone>> = {
  likely: 'ok',
  unverified: 'neutral',
  ruled_out: 'unknown',
}

const TEXT: Readonly<Record<HypothesisState, string>> = {
  likely: 'text-heading leading-6 text-foreground',
  unverified: 'text-sm leading-6 text-muted-foreground',
  ruled_out: 'text-sm leading-6 text-dim-foreground line-through decoration-dim-foreground/60',
}

/** The steps that cite one item, each a way to that step. */
export function StepLinks({
  steps,
  onJump,
}: {
  steps: readonly number[]
  onJump: (step: number) => void
}) {
  if (steps.length === 0) return null
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-nano text-dim-foreground">
      <span>{steps.length === 1 ? 'step' : 'steps'}</span>
      {steps.map((step) => (
        <button
          key={step}
          type="button"
          aria-label={`Go to step ${step}`}
          onClick={() => onJump(step)}
          className={cn(
            'rounded-sm tabular-nums text-muted-foreground underline decoration-border underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-foreground hover:decoration-signal',
            FOCUS,
          )}
        >
          {step}
        </button>
      ))}
    </span>
  )
}

interface HypothesesProps {
  /** In reading order. */
  hypotheses: readonly Hypothesis[]
  /** The steps the trail holds, so a step is only offered where it lands. */
  known: ReadonlySet<number>
  /** The one in focus, by its place in that order. */
  focused: number | null
  onFocus: (index: number) => void
  onJump: (step: number) => void
}

export function Hypotheses({ hypotheses, known, focused, onFocus, onJump }: HypothesesProps) {
  if (hypotheses.length === 0) return null
  return (
    <section aria-labelledby="finding-hypotheses">
      <SectionHeader
        layout="page"
        id="finding-hypotheses"
        title="Hypotheses"
        description="Press one to see the steps that tested it."
        className={SECTION_HEAD_GAP}
      />
      <ul aria-label="Hypotheses" className="flex flex-col">
        {hypotheses.map((hypothesis, index) => (
          <li
            key={index}
            data-state={hypothesis.state}
            className={cn(
              '-mx-2 flex items-start gap-3 rounded-lg pr-2',
              hypothesis.state === 'likely'
                ? 'bg-state-ok-fill'
                : 'border-b border-shell-separator last:border-b-0',
              focused === index && 'bg-accent',
            )}
          >
            <button
              type="button"
              aria-pressed={focused === index}
              onClick={() => onFocus(index)}
              className={cn(
                'grid min-w-0 flex-1 grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 rounded-md px-2 py-3 text-left transition-colors duration-[var(--duration-fast)] hover:bg-accent',
                FOCUS,
                'focus-visible:-outline-offset-2',
              )}
            >
              <span
                className={cn(
                  'pt-0.5 font-mono text-xs tabular-nums',
                  hypothesis.state === 'likely' ? 'text-state-ok' : 'text-dim-foreground',
                )}
              >
                {hypothesisId(index)}
              </span>
              <span className={cn('max-w-[72ch]', TEXT[hypothesis.state])}>{hypothesis.text}</span>
              <Chip tone={STATE_TONE[hypothesis.state]} soft={hypothesis.state === 'likely'}>
                {HYPOTHESIS_WORD[hypothesis.state]}
              </Chip>
            </button>
            <span className="w-24 shrink-0 pt-3.5 pb-3">
              <StepLinks steps={citedSteps(hypothesis, known)} onJump={onJump} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Checked({
  facts,
  known,
  onJump,
}: {
  facts: readonly CheckedFact[]
  known: ReadonlySet<number>
  onJump: (step: number) => void
}) {
  if (facts.length === 0) return null
  return (
    <section aria-labelledby="finding-checked">
      <SectionHeader
        layout="page"
        id="finding-checked"
        title="Verified"
        description="Facts the agent read off its own calls."
        className={SECTION_HEAD_GAP}
      />
      <ul
        aria-label="Verified"
        className="flex flex-col divide-y divide-shell-separator rounded-lg bg-well"
      >
        {facts.map((fact, index) => (
          <li key={index} className="flex items-start gap-3 px-3.5 py-2.5">
            <Check aria-hidden="true" className="mt-1.5 h-3.5 w-3.5 shrink-0 text-state-ok" />
            <FindingProse text={fact.text} className="min-w-0 flex-1 text-foreground" />
            <span className="shrink-0 pt-1">
              <StepLinks steps={citedSteps(fact, known)} onJump={onJump} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
