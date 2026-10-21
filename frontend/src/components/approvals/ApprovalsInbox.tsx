/**
 * The review inbox: a list on a `ListCard`, one `FoldRow` per request.
 *
 * The row's decision lane holds everything a reviewer can do to it — Approve,
 * Reject, or Withdraw on one's own request — or, once it is over, what became
 * of it. Expanding a row shows the before/after diff (from the resource
 * registry), the review note, the outcome and the request's link. Any tool's
 * requests plug in through the registry without touching this file.
 *
 * Approve is one press by design: reviewing is what the inbox is for, and a
 * confirm on every row would be a second yes for the same decision. Reject
 * opens its note; the note is required.
 */
import { getRouteApi } from '@tanstack/react-router'
import { Check, Inbox, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Chip, type ChipTone } from '@/components/ui/chip'
import { CopyButton } from '@/components/ui/copy-button'
import { EnvSignal } from '@/components/ui/env-signal'
import { ErrorState } from '@/components/ui/error-state'
import { FoldRow } from '@/components/ui/fold'
import { Field, Textarea } from '@/components/ui/input'
import { ListCard } from '@/components/ui/list-card'
import { ResourceAnchor } from '@/components/ui/resource-anchor'
import { SECTION_HEAD_GAP, SectionHeader } from '@/components/ui/section-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { StateMark } from '@/components/ui/state-mark'
import {
  type ApprovalListStatus,
  useApprovalDecisions,
  useApprovals,
} from '@/features/approvals/use-approvals'
import { inEnv } from '@/features/auth/permissions'
import { useScopes } from '@/features/auth/use-scopes'
import { buildResourceLink } from '@/lib/resource-links'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import { TRANSITION_PANE } from '@/lib/view-transition'
import type { Approval, ApprovalStatus } from '@/types/api'
import { resourceConfig } from './resource-registry'

const route = getRouteApi('/approvals')

/** The row: its summary, then the decision lane at one fixed width. */
const COLUMNS = 'minmax(0,1fr) 13rem'

/**
 * Inside the summary: Request · Env · Requested by · When. The header and
 * every row share it, behind the same 28px chevron lane. Below a 42rem card
 * the summary stacks Request over Env, the lane takes its natural width, and
 * the column heads go, since nothing lines up under them any more.
 */
const SUMMARY_COLUMNS =
  'grid grid-cols-[minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 @2xl:grid-cols-[minmax(0,1.6fr)_6rem_minmax(0,1fr)_7rem]'

/** Requested by and When: wide cards only. */
const WIDE_ONLY = 'hidden @2xl:block'

type Outcome = { word: string; tone: ChipTone }

/**
 * Every status that is over, and how it reads. `satisfies` the union, so a
 * status the API adds later fails the typecheck instead of quietly offering
 * Approve and Reject on something nobody can act on.
 */
const OUTCOME = {
  approved: { word: 'Approved', tone: 'ok' },
  rejected: { word: 'Rejected', tone: 'bad' },
  withdrawn: { word: 'Withdrawn', tone: 'neutral' },
  expired: { word: 'Expired', tone: 'unknown' },
  failed: { word: 'Failed', tone: 'bad' },
} as const satisfies Record<Exclude<ApprovalStatus, 'pending'>, Outcome>

function isPending(status: ApprovalStatus): status is 'pending' {
  return status === 'pending'
}

export function ApprovalsInbox() {
  const { status = 'pending', id } = route.useSearch()
  const navigate = route.useNavigate()
  const { data, isPending: loading, error, refetch } = useApprovals(status)
  const pendingCount = useApprovals('pending').data?.length

  const setStatus = (next: ApprovalListStatus) =>
    void navigate({ search: (prev) => ({ ...prev, status: next }), viewTransition: true })

  return (
    <section aria-labelledby="inbox-heading" className="flex flex-col">
      <SectionHeader
        layout="page"
        id="inbox-heading"
        title={status === 'pending' ? 'Waiting for review' : 'Every request'}
        description="Changes outside a direct environment wait here for a second person."
        className={SECTION_HEAD_GAP}
        action={
          <SegmentedControl
            label="Requests shown"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: 'pending', label: 'Pending', count: pendingCount },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />
      <div className={TRANSITION_PANE}>
        {error ? (
          <ErrorState noun="requests" detail={error.message} onRetry={() => void refetch()} />
        ) : loading ? (
          <InboxSkeleton />
        ) : data.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={status === 'pending' ? 'Nothing is waiting for review' : 'No requests yet'}
            body="A change to a flag outside a direct environment shows up here until someone approves or rejects it."
          />
        ) : (
          <ListCard columns={COLUMNS}>
            <ListCard.Header className="gap-x-2 pl-0 @max-2xl:hidden">
              <span className="grid grid-cols-[28px_minmax(0,1fr)]">
                <span />
                <span className={SUMMARY_COLUMNS}>
                  <span>Request</span>
                  <span>Env</span>
                  <span>Requested by</span>
                  <span>When</span>
                </span>
              </span>
              <span className="text-right">Decision</span>
            </ListCard.Header>
            <ul aria-label="Approval requests">
              {data.map((approval) => (
                <ListCard.Item key={approval.id}>
                  <ApprovalRow approval={approval} focused={approval.id === id} />
                </ListCard.Item>
              ))}
            </ul>
          </ListCard>
        )}
      </div>
    </section>
  )
}

function InboxSkeleton() {
  return (
    <ListCard columns={COLUMNS} aria-busy="true">
      {[0, 1, 2].map((row) => (
        <ListCard.Surface key={row} size="md" className="@max-2xl:grid-cols-[minmax(0,1fr)_auto]">
          <span className={cn(SUMMARY_COLUMNS, 'pl-7')}>
            <Skeleton className="h-3 w-full max-w-48" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className={cn('h-3 w-28', WIDE_ONLY)} />
            <Skeleton className={cn('h-3 w-14', WIDE_ONLY)} />
          </span>
          <Skeleton className="ml-auto h-7 w-36" />
        </ListCard.Surface>
      ))}
    </ListCard>
  )
}

function ApprovalRow({ approval, focused }: { approval: Approval; focused: boolean }) {
  const config = resourceConfig(approval.tool)
  const Icon = config.icon
  const [open, setOpen] = useState(focused)
  const [rejecting, setRejecting] = useState(false)
  const row = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: 'center' })
  }, [focused])

  return (
    <div ref={row} className="group/row">
      <FoldRow
        open={open}
        onOpenChange={setOpen}
        selected={focused}
        aria-label={`${config.actionLabel(approval.action)} ${approval.target} in ${approval.env}`}
        summary={
          <span className={cn(SUMMARY_COLUMNS, 'py-2')}>
            <span className="flex min-w-0 items-center gap-2">
              <Icon aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', config.tint)} />
              <span className="shrink-0 text-label text-muted-foreground">
                {config.actionLabel(approval.action)}
              </span>
              <span className="mono truncate text-foreground">{approval.target}</span>
            </span>
            <EnvSignal env={approval.env} />
            <span className={cn('truncate text-xs text-muted-foreground', WIDE_ONLY)}>
              {approval.requested_by}
            </span>
            <time
              dateTime={approval.requested_at}
              className={cn(
                'font-mono text-nano whitespace-nowrap tabular-nums text-dim-foreground',
                WIDE_ONLY,
              )}
            >
              {relativeTime(approval.requested_at)}
            </time>
          </span>
        }
        actions={
          <span className="flex justify-end @2xl:w-[13rem]">
            <DecisionLane
              approval={approval}
              onReject={() => {
                setOpen(true)
                setRejecting(true)
              }}
            />
          </span>
        }
      >
        <ApprovalBody
          approval={approval}
          rejecting={rejecting}
          onRejectDone={() => setRejecting(false)}
        />
      </FoldRow>
    </div>
  )
}

function DecisionLane({ approval, onReject }: { approval: Approval; onReject: () => void }) {
  const { email, can } = useScopes()
  const { approve, withdraw } = useApprovalDecisions()

  if (!isPending(approval.status)) {
    const outcome = OUTCOME[approval.status]
    return (
      <Chip tone={outcome.tone} soft hint={approval.result ?? undefined}>
        {outcome.word}
      </Chip>
    )
  }

  if (approval.requested_by === email) {
    return (
      <span className="flex items-center gap-2">
        <StateMark tone="warn" word="Pending" size="sm" />
        <Button
          variant="danger"
          size="xs"
          hint="Take the request back; nothing changes"
          disabled={withdraw.isPending}
          onClick={() => withdraw.mutate({ id: approval.id })}
        >
          <Undo2 aria-hidden="true" className="h-3 w-3" />
          Withdraw
        </Button>
      </span>
    )
  }

  const reviewer = can(inEnv('approvals', 'review', approval.env))
  return (
    <span className="flex items-center gap-1.5">
      <Button
        variant="soft"
        size="xs"
        mutates
        disabled={!reviewer || approve.isPending}
        hint={
          reviewer
            ? `Apply to ${approval.env}`
            : `Reviewing needs approvals:review in ${approval.env}`
        }
        onClick={() => approve.mutate({ id: approval.id })}
      >
        <Check aria-hidden="true" className="h-3 w-3 text-state-ok" />
        Approve
      </Button>
      <Button
        variant="danger"
        size="xs"
        disabled={!reviewer}
        hint={
          reviewer ? 'Reject with a note' : `Reviewing needs approvals:review in ${approval.env}`
        }
        onClick={onReject}
      >
        <X aria-hidden="true" className="h-3 w-3" />
        Reject
      </Button>
    </span>
  )
}

function ApprovalBody({
  approval,
  rejecting,
  onRejectDone,
}: {
  approval: Approval
  rejecting: boolean
  onRejectDone: () => void
}) {
  const config = resourceConfig(approval.tool)
  const subject = config.link(approval)
  const link = buildResourceLink({ kind: 'approval', id: approval.id })
  return (
    <div className="flex flex-col gap-4 pt-1 pb-1">
      {config.renderDiff(approval)}
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <dt className="field-label">Requested</dt>
        <dd className="text-muted-foreground">
          {approval.requested_by} · {formatDate(approval.requested_at)}
        </dd>
        {approval.reviewed_by && (
          <>
            <dt className="field-label">Reviewed</dt>
            <dd className="text-muted-foreground">
              {approval.reviewed_by}
              {approval.reviewed_at && ` · ${formatDate(approval.reviewed_at)}`}
            </dd>
          </>
        )}
        {approval.review_note && (
          <>
            <dt className="field-label">Note</dt>
            <dd className="text-foreground">{approval.review_note}</dd>
          </>
        )}
        {approval.result && (
          <>
            <dt className="field-label">Result</dt>
            <dd
              className={approval.status === 'failed' ? 'text-state-bad' : 'text-muted-foreground'}
            >
              {approval.result}
            </dd>
          </>
        )}
      </dl>
      <div className="flex items-center gap-2">
        {subject && (
          <ResourceAnchor
            resource={subject}
            className="rounded-sm text-xs text-signal hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            Open {config.noun}
          </ResourceAnchor>
        )}
        <span className="mono ml-auto truncate text-dim-foreground">{approval.id}</span>
        <CopyButton value={link} label="Copy request link" size="xs" />
      </div>
      {rejecting && isPending(approval.status) && (
        <RejectForm approval={approval} onDone={onRejectDone} />
      )}
    </div>
  )
}

function RejectForm({ approval, onDone }: { approval: Approval; onDone: () => void }) {
  const [note, setNote] = useState('')
  const { reject } = useApprovalDecisions()
  const fieldId = `reject-note-${approval.id}`
  return (
    <form
      className="flex flex-col gap-3 rounded-lg bg-well p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!note.trim()) return
        reject.mutate({ id: approval.id, note: note.trim() }, { onSuccess: onDone })
      }}
    >
      <Field label="Why it is rejected" htmlFor={fieldId} help="The requester reads this note.">
        <Textarea
          id={fieldId}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What would make this change acceptable"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="glass-rose"
          size="sm"
          disabled={!note.trim() || reject.isPending}
          hint={note.trim() ? undefined : 'Write a note first'}
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          {reject.isPending ? 'Rejecting…' : 'Reject request'}
        </Button>
      </div>
    </form>
  )
}
