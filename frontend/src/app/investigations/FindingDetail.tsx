/**
 * One finding, read the way a reviewer reads it: its facts under the title,
 * then what the agent concluded, what it verified, what it needs a person to
 * do, what it weighed, and the notebook of every call it made. What is known
 * about the alarm and the findings before this one waits folded below, and
 * the decision stays pinned along the foot.
 *
 * The close dialog is URL state (`?close=wrong`), so "close this as wrong" is
 * a link. Keys follow the buttons: `a` and `c` answer only where the buttons
 * would, and Escape goes back to the list.
 */
import { getRouteApi, Link } from '@tanstack/react-router'
import { ChevronDown, Share2, Siren } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { EnvSignal } from '@/components/ui/env-signal'
import { ErrorState } from '@/components/ui/error-state'
import { Fold } from '@/components/ui/fold'
import { Hint, InfoTerm, InfoTip } from '@/components/ui/hint'
import { Menu, MenuItem } from '@/components/ui/menu'
import { Panel } from '@/components/ui/panel'
import { SECTION_GAP, SECTION_HEAD_GAP, SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StateMark } from '@/components/ui/state-mark'
import { inEnv } from '@/features/auth/permissions'
import { useScopes } from '@/features/auth/use-scopes'
import { useWritesBlocked } from '@/features/auth/view-as'
import { findingMarkdown } from '@/features/findings/findings-markdown'
import { paramsOf, searchOf } from '@/features/findings/findings-search'
import {
  citationsByStep,
  citedSteps,
  contextEvidence,
  orderedHypotheses,
  stepRowId,
  trailSteps,
} from '@/features/findings/findings-reasoning'
import {
  STATUS_WORD,
  contextTone,
  outcomeWord,
  resolutionWord,
  resolutionsFor,
  sentenceCase,
  severityTone,
} from '@/features/findings/findings-words'
import { useFindingActions } from '@/features/findings/use-finding-actions'
import { useFinding } from '@/features/findings/use-findings'
import { useTriageKeys } from '@/features/findings/use-triage-keys'
import { APIError } from '@/lib/api-client'
import { notifyFailure } from '@/lib/notify'
import { buildResourceLink } from '@/lib/resource-links'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { toast } from '@/lib/toast'
import { useCopy } from '@/lib/use-copy'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import type { FindingDetail as Finding, Resolution } from '@/types/api'
import { CloseFindingDialog } from './CloseFindingDialog'
import { FindingActions } from './FindingActions'
import { FindingDecision } from './FindingDecision'
import { FindingNotebook } from './FindingNotebook'
import { FindingProse } from './FindingProse'
import { Checked, Hypotheses } from './FindingReasoning'

const route = getRouteApi('/investigations/$env/$findingId')
const listRoute = getRouteApi('/investigations')

/** How long a step a jump lands on stays lit. */
const HIGHLIGHT_MS = 1600

const LINK =
  'rounded-sm underline decoration-border underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-foreground hover:decoration-signal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

export function FindingDetail() {
  const { env, findingId } = route.useParams()
  const { data: finding, isPending, error, refetch } = useFinding(env, findingId)

  if (isPending) return <DetailSkeleton />
  if (error instanceof APIError && error.status === 404) {
    return (
      <EmptyState
        variant="inspector"
        icon={<Siren />}
        title={`No investigation ${findingId} in ${env}`}
        body="It may have expired, or it was opened from a link to another environment."
      />
    )
  }
  if (error) {
    return (
      <ErrorState
        variant="inspector"
        noun="this investigation"
        detail={error.message}
        onRetry={() => void refetch()}
      />
    )
  }
  return <FindingBody key={`${finding.env}/${finding.finding_id}`} finding={finding} />
}

/** Brings a step into view and focus, lit for a moment. */
function useStepJump() {
  const [jump, setJump] = useState<{ step: number } | null>(null)
  useEffect(() => {
    if (!jump) return undefined
    const row = document.getElementById(stepRowId(jump.step))
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    row?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    row?.focus({ preventScroll: true })
    const timer = setTimeout(() => setJump(null), HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [jump])
  return { highlighted: jump?.step ?? null, jumpTo: (step: number) => setJump({ step }) }
}

function FindingBody({ finding }: { finding: Finding }) {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { can } = useScopes()
  const writesBlocked = useWritesBlocked()
  const actions = useFindingActions()
  const [focused, setFocused] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const { highlighted, jumpTo } = useStepJump()
  const canReview = can(inEnv('findings', 'review', finding.env))
  const busy = actions.acknowledging || actions.closing
  const known = trailSteps(finding.tool_trail)
  const hypotheses = orderedHypotheses(finding)
  const title = finding.title ?? finding.alarm_name ?? finding.finding_id
  const reviewable = canReview && !writesBlocked && !busy && finding.status !== 'closed'

  const review = (resolution: Resolution | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, close: resolution }) })
  const resolve = (resolution: Resolution) =>
    void actions
      .close(finding.env, finding.finding_id, { resolution })
      .catch((error: unknown) =>
        notifyFailure(`Couldn't close ${finding.finding_id} in ${finding.env}`, error),
      )
  const acknowledge = () => actions.acknowledge(finding.env, finding.finding_id)
  const backToList = () =>
    void navigate({
      to: '/investigations',
      search: (prev) => ({ ...prev, close: undefined }),
      viewTransition: true,
    })

  const focusHypothesis = (index: number | null, follow: boolean) => {
    setFocused(index)
    const hypothesis = index === null ? undefined : hypotheses[index]
    const first = hypothesis ? citedSteps(hypothesis, known)[0] : undefined
    if (follow && first !== undefined) jumpTo(first)
  }

  useTriageKeys({
    a: reviewable && finding.status === 'open' ? acknowledge : null,
    c: reviewable ? () => review(resolutionsFor(finding.outcome)[0]) : null,
    h:
      hypotheses.length > 0
        ? () =>
            focusHypothesis(
              focused === null ? 0 : focused + 1 < hypotheses.length ? focused + 1 : null,
              true,
            )
        : null,
    Escape: backToList,
  })

  return (
    <article
      aria-labelledby="finding-heading"
      className="@container flex min-h-full flex-col px-gutter-pane pt-4"
    >
      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Siren
            aria-hidden="true"
            className={cn('mt-1.5 h-4 w-4 shrink-0', TOOL_ACCENTS.investigations.text)}
          />
          <h1
            id="finding-heading"
            className="min-w-0 flex-1 font-display text-title leading-7 font-semibold tracking-[-0.01em] text-balance text-foreground"
          >
            {title}
          </h1>
          <ShareMenu finding={finding} />
        </div>
        <Facts finding={finding} onOpenHistory={() => setHistoryOpen(true)} />
      </header>

      <div className={cn('mt-8 flex flex-1 flex-col pb-10', SECTION_GAP)}>
        {(finding.likely_cause || finding.summary) && (
          <section aria-labelledby="finding-finding">
            <SectionHeader
              layout="page"
              id="finding-finding"
              title="Finding"
              description={`${outcomeWord(finding.outcome)} by the agent`}
              className={SECTION_HEAD_GAP}
            />
            <dl className="grid max-w-[80ch] grid-cols-[4.5rem_minmax(0,1fr)] gap-x-5 gap-y-4">
              {finding.likely_cause && (
                <>
                  <dt className="field-label pt-1 text-state-ok">Cause</dt>
                  <dd>
                    <FindingProse
                      text={finding.likely_cause}
                      className="text-base leading-7 text-foreground"
                    />
                  </dd>
                </>
              )}
              {finding.summary && (
                <>
                  <dt className="field-label pt-1">Impact</dt>
                  <dd>
                    <FindingProse text={finding.summary} className="text-muted-foreground" />
                  </dd>
                </>
              )}
            </dl>
          </section>
        )}

        <Checked facts={finding.checked} known={known} onJump={jumpTo} />

        <FindingActions finding={finding} />

        <Hypotheses
          hypotheses={hypotheses}
          known={known}
          focused={focused}
          onFocus={(index) => focusHypothesis(focused === index ? null : index, true)}
          onJump={jumpTo}
        />

        <FindingNotebook
          steps={finding.tool_trail}
          citations={citationsByStep(finding)}
          context={contextEvidence(finding)}
          hypotheses={hypotheses}
          focused={focused}
          onFocus={(index) => focusHypothesis(focused === index ? null : index, false)}
          highlighted={highlighted}
          outcome={finding.outcome}
          run={finding.run}
          calls={finding.tool_call_count}
          tokens={finding.tokens_used}
        />

        <Fold title="Alarm and resource">
          <AlarmAndResource finding={finding} />
        </Fold>

        <Fold
          title="History"
          aside={finding.history.length || undefined}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        >
          <History finding={finding} />
        </Fold>
      </div>

      <FindingDecision
        finding={finding}
        canReview={canReview}
        busy={busy}
        onAcknowledge={acknowledge}
        onResolve={resolve}
        onReview={review}
        className="sticky bottom-0 z-[1] -mx-gutter-pane px-gutter-pane"
      />

      <CloseFindingDialog
        finding={finding}
        open={search.close !== undefined && canReview && finding.status !== 'closed'}
        initial={search.close}
        onOpenChange={(open) => !open && review(undefined)}
      />
    </article>
  )
}

/** Copy the finding for someone else: its link, or the whole of it as Markdown. */
function ShareMenu({ finding }: { finding: Finding }) {
  const link = buildResourceLink({ kind: 'finding', id: finding.finding_id, env: finding.env })
  const { copy: copyLink } = useCopy(link)
  const { copy: copyMarkdown } = useCopy(findingMarkdown(finding, link))
  const share = async (copy: () => Promise<boolean>, done: string) => {
    if (await copy()) toast.success(done)
    else toast.error('Could not copy to the clipboard')
  }
  return (
    <Menu
      align="end"
      className="min-w-44"
      trigger={
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <Share2 aria-hidden="true" className="h-3.5 w-3.5" />
          Share
          <ChevronDown aria-hidden="true" className="h-3 w-3" />
        </button>
      }
    >
      <MenuItem onSelect={() => void share(copyLink, 'Link copied')}>Copy link</MenuItem>
      <MenuItem onSelect={() => void share(copyMarkdown, 'Copied as Markdown')}>
        Copy as Markdown
      </MenuItem>
    </Menu>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="field-label">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-sm text-foreground">{children}</dd>
    </div>
  )
}

/** A word with the agent's sentence behind it, when it gave one. */
function Reasoned({ word, reason }: { word: string; reason: string | null | undefined }) {
  if (!reason) return <span>{word}</span>
  return (
    <InfoTip heading={word} trigger={<InfoTerm>{word}</InfoTerm>}>
      {reason}
    </InfoTip>
  )
}

function Facts({ finding, onOpenHistory }: { finding: Finding; onOpenHistory: () => void }) {
  const severityReason =
    finding.proposed_severity && finding.severity_floor
      ? `The agent proposed ${finding.proposed_severity}; the alarm's floor is ${finding.severity_floor}.`
      : finding.severity_floor
        ? `The alarm's floor is ${finding.severity_floor}.`
        : null
  return (
    <Panel tone="well" pad="lg">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 @lg:grid-cols-3 @3xl:grid-cols-6">
        {finding.severity && (
          <Fact label="Severity">
            <StateMark
              tone={severityTone(finding.severity)}
              word={sentenceCase(finding.severity)}
              mode="delegated"
            />
            <Reasoned word={sentenceCase(finding.severity)} reason={severityReason} />
          </Fact>
        )}
        {finding.confidence && (
          <Fact label="Confidence">
            <Reasoned word={sentenceCase(finding.confidence)} reason={finding.confidence_reason} />
          </Fact>
        )}
        {finding.fix_effort && (
          <Fact label="Effort">
            <Reasoned word={sentenceCase(finding.fix_effort)} reason={finding.fix_effort_reason} />
          </Fact>
        )}
        <Fact label="Status">
          <span>
            {finding.status === 'closed'
              ? resolutionWord(finding.resolution)
              : STATUS_WORD[finding.status]}
          </span>
        </Fact>
        <Fact label="Opened">
          <Hint label={formatDate(finding.created_at)}>
            <time dateTime={finding.created_at}>{relativeTime(finding.created_at)}</time>
          </Hint>
          <span className="sr-only"> ({formatDate(finding.created_at)})</span>
        </Fact>
        <Fact label="Environment">
          <Link
            to="/investigations"
            search={{ env: finding.env }}
            viewTransition
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <EnvSignal env={finding.env} />
          </Link>
        </Fact>
        {finding.history.length > 0 && (
          <Fact label="Before">
            <button type="button" onClick={onOpenHistory} className={cn(LINK, 'font-mono text-xs')}>
              {`${finding.history.length} ${finding.history.length === 1 ? 'run' : 'runs'}`}
            </button>
          </Fact>
        )}
        {finding.recurrence_count > 0 && (
          <Fact label="Fired again">
            <span className="font-mono text-xs tabular-nums">{`${finding.recurrence_count}×`}</span>
          </Fact>
        )}
      </dl>
    </Panel>
  )
}

function AlarmAndResource({ finding }: { finding: Finding }) {
  const members = finding.member_alarms.length > 0
  const others = members ? finding.member_alarms : finding.linked_alarms
  const sections = Object.entries(finding.context_summary?.sections ?? {})
  return (
    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-xs">
      <dt className="field-label">Alarm</dt>
      <dd className="flex min-w-0 flex-col gap-1">
        <span className="mono break-all text-foreground">{finding.alarm_name ?? 'Unnamed'}</span>
        {finding.alarm_reason && <p className="text-muted-foreground">{finding.alarm_reason}</p>}
        {finding.alarm_time && (
          <p className="font-mono text-nano text-dim-foreground">
            {`In alarm since ${formatDate(finding.alarm_time)}`}
          </p>
        )}
      </dd>
      {others.length > 0 && (
        <>
          <dt className="field-label">{members ? 'Members' : 'Linked'}</dt>
          <dd>
            <ul
              aria-label={members ? 'Member alarms' : 'Linked alarms'}
              className="flex flex-col gap-0.5"
            >
              {others.map((name) => (
                <li key={name} className="mono break-all text-muted-foreground">
                  {name}
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
      <dt className="field-label">Resource</dt>
      <dd className="flex min-w-0 flex-col gap-1">
        <span className="mono break-all text-foreground">
          {[finding.resource_type, finding.resource_name].filter(Boolean).join(' ') || 'Unknown'}
        </span>
        {finding.error_signature && (
          <p className="mono break-words text-muted-foreground">{finding.error_signature}</p>
        )}
        {finding.region && (
          <p className="font-mono text-nano text-dim-foreground">{finding.region}</p>
        )}
      </dd>
      {sections.length > 0 && (
        <>
          <dt className="field-label">Context</dt>
          <dd>
            <ul
              aria-label="Context"
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1"
            >
              {sections.map(([name, status]) => (
                <li key={name} className="contents">
                  <span className="truncate text-muted-foreground">{name}</span>
                  <span className="flex items-center gap-1.5">
                    <StateMark tone={contextTone(status)} word={status} size="sm" />
                    {finding.context_summary?.counts[name] !== undefined && (
                      <span className="count">{finding.context_summary.counts[name]}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
      {finding.model && (
        <>
          <dt className="field-label">Model</dt>
          <dd className="mono text-muted-foreground">{finding.model}</dd>
        </>
      )}
    </dl>
  )
}

function History({ finding }: { finding: Finding }) {
  const list = listRoute.useSearch()
  if (finding.history.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title={`The first investigation on this ${finding.resource_type ?? 'resource'}.`}
      />
    )
  }
  return (
    <ul aria-label="History" className="flex flex-col text-xs">
      {finding.history.map((entry) => (
        <li key={entry.finding_id}>
          <Link
            to="/investigations/$env/$findingId"
            params={{ env: finding.env, findingId: entry.finding_id }}
            search={{ env: list.env, ...searchOf(paramsOf(list)) }}
            viewTransition
            className="-mx-2 grid grid-cols-[5rem_minmax(0,1fr)_auto] items-baseline gap-3 rounded-md px-2 py-1.5 transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <span className="font-mono text-nano tabular-nums text-dim-foreground">
              {entry.created_at ? relativeTime(entry.created_at) : 'Unknown'}
            </span>
            <span className="truncate text-foreground">{entry.title ?? entry.finding_id}</span>
            <span className="text-dim-foreground">
              {entry.resolution
                ? resolutionWord(entry.resolution)
                : sentenceCase(entry.status ?? 'open')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6 px-gutter-pane pt-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
