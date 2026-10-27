/**
 * What a reviewer does with a finding, as the bar along the foot of its pane.
 *
 * A reported cause is answered with how the agent did: Confirmed and False
 * positive close it at a press, and Wrong opens the close dialog for the note
 * it needs. A finding that reported nothing has nothing to grade, so it can
 * only be acknowledged or dismissed. A closed one says how, by whom and why.
 * A reader without the review scope sees the state and nothing to press.
 *
 * A review lands at once in every environment: it records a verdict on the
 * agent's output and changes nothing the finding is about.
 */
import { Ban, Check, Eye, MessageSquareX, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/hint'
import { RESOLUTION_MEANING, isReported, resolutionWord } from '@/features/findings/findings-words'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import type { FindingDetail, Resolution } from '@/types/api'

const ICON = 'h-3.5 w-3.5'

function When({ at }: { at: string | null | undefined }) {
  if (!at) return null
  return (
    <Hint label={formatDate(at)}>
      <time dateTime={at} className="text-dim-foreground">
        {` · ${relativeTime(at)}`}
      </time>
    </Hint>
  )
}

function Bar({
  children,
  actions,
  className,
}: {
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label="Decision"
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-shell-separator bg-panel py-3.5',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">{children}</div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  )
}

interface FindingDecisionProps {
  finding: FindingDetail
  canReview: boolean
  busy: boolean
  onAcknowledge: () => void
  /** Close with an answer that needs nothing more said. */
  onResolve: (resolution: Resolution) => void
  /** Open the close dialog on an answer. */
  onReview: (resolution: Resolution) => void
  className?: string
}

export function FindingDecision({
  finding,
  canReview,
  busy,
  onAcknowledge,
  onResolve,
  onReview,
  className,
}: FindingDecisionProps) {
  if (finding.status === 'closed') {
    return (
      <Bar className={className}>
        <p className="text-sm text-foreground">
          <span className="font-semibold">{resolutionWord(finding.resolution)}</span>
          {finding.resolved_by && (
            <span className="text-muted-foreground">{` by ${finding.resolved_by}`}</span>
          )}
          <When at={finding.resolved_at} />
        </p>
        {finding.resolution_note && (
          <p className="max-w-[72ch] text-xs leading-5 whitespace-pre-line text-muted-foreground">
            {finding.resolution_note}
          </p>
        )}
      </Bar>
    )
  }

  const standing =
    finding.status === 'acknowledged' ? (
      <p className="text-xs text-muted-foreground">
        Acknowledged
        {finding.acknowledged_by && ` by ${finding.acknowledged_by}`}
        <When at={finding.acknowledged_at} />
      </p>
    ) : (
      <p className="text-xs text-muted-foreground">Open. Nobody has reviewed it yet.</p>
    )

  if (!canReview) {
    return (
      <Bar className={className}>
        {standing}
        <p className="text-xs text-dim-foreground">
          Reviewing needs findings:review in {finding.env}.
        </p>
      </Bar>
    )
  }

  const graded = isReported(finding.outcome)
  const answers = graded ? (
    <>
      <Button
        variant="soft"
        size="sm"
        mutates
        disabled={busy}
        hint={`Close it: ${RESOLUTION_MEANING.confirmed.meaning.toLowerCase()}`}
        onClick={() => onResolve('confirmed')}
      >
        <Check aria-hidden="true" className={cn(ICON, 'text-state-ok')} />
        Confirmed
      </Button>
      <Button
        variant="soft"
        size="sm"
        mutates
        disabled={busy}
        hint={`Close it: ${RESOLUTION_MEANING.false_positive.meaning.toLowerCase()}`}
        onClick={() => onResolve('false_positive')}
      >
        <Ban aria-hidden="true" className={ICON} />
        False positive
      </Button>
      <Button
        variant="soft"
        size="sm"
        mutates
        disabled={busy}
        hint="Something was wrong, but not this. Asks for a note; never shown to the agent."
        onClick={() => onReview('wrong')}
      >
        <MessageSquareX aria-hidden="true" className={ICON} />
        Wrong
      </Button>
    </>
  ) : (
    <Button
      variant="soft"
      size="sm"
      mutates
      disabled={busy}
      hint="Clear it from the queue: there is no cause to grade"
      onClick={() => onResolve('dismissed')}
    >
      <X aria-hidden="true" className={ICON} />
      Dismiss
    </Button>
  )

  return (
    <Bar
      className={className}
      actions={
        <>
          {finding.status === 'open' && (
            <Button
              variant="ghost"
              size="sm"
              mutates
              disabled={busy}
              hint="Say somebody is looking at it"
              onClick={onAcknowledge}
            >
              <Eye aria-hidden="true" className={ICON} />
              Acknowledge
            </Button>
          )}
          {answers}
        </>
      }
    >
      {standing}
      <p className="text-sm font-medium text-foreground">
        {graded ? 'Was the agent right?' : 'No cause to grade'}
      </p>
      <p className="text-xs text-dim-foreground">
        {graded
          ? 'Confirmed and False positive teach its next run on this resource.'
          : RESOLUTION_MEANING.dismissed.meaning}
      </p>
    </Bar>
  )
}
