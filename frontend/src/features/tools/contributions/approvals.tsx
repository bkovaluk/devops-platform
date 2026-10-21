/**
 * What Approvals lends to the shared surfaces: the pending count, Home's one
 * primary action while something waits, and the requests in the feed.
 */
import { useNavigate } from '@tanstack/react-router'
import { GitPullRequest } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resourceConfig } from '@/components/approvals/resource-registry'
import { useApprovals, usePendingCount } from '@/features/approvals/use-approvals'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { cn } from '@/lib/utils'
import type { Approval } from '@/types/api'
import { activitySlot } from '../activity-slot'
import { AttentionTile, RailCount } from '../home-parts'

const FEED_DEPTH = 8

const DETAIL: Record<Approval['status'], (approval: Approval) => string> = {
  pending: (a) => `requested ${resourceConfig(a.tool).actionPhrase(a.action)}`,
  approved: (a) => `approved by ${a.reviewed_by ?? 'a reviewer'}`,
  rejected: (a) => `rejected by ${a.reviewed_by ?? 'a reviewer'}`,
  withdrawn: () => 'withdrawn by the requester',
  expired: () => 'expired unreviewed',
  failed: () => 'approved, but the change failed',
}

const TINT: Partial<Record<Approval['status'], string>> = {
  pending: 'text-state-warn',
  failed: 'text-state-bad',
}

export function ApprovalsCount() {
  return <RailCount count={usePendingCount()} className="text-state-warn" />
}

export function ApprovalsQuickAction() {
  const pending = usePendingCount()
  const navigate = useNavigate()
  const open = () => void navigate({ to: '/approvals', search: { status: 'pending' } })
  // Home's one primary, and only while something is waiting.
  if (pending > 0) {
    return (
      <Button size="sm" onClick={open}>
        <GitPullRequest aria-hidden="true" className="h-3.5 w-3.5" />
        Review approvals ({pending})
      </Button>
    )
  }
  return (
    <Button variant="soft" size="sm" onClick={open}>
      <GitPullRequest
        aria-hidden="true"
        className={cn('h-3.5 w-3.5', TOOL_ACCENTS.approvals.text)}
      />
      Approvals
    </Button>
  )
}

export function ApprovalsAttention() {
  const pending = usePendingCount()
  return (
    <AttentionTile
      eyebrow="Approvals"
      to="/approvals"
      line={<span className={pending > 0 ? 'text-amber-text' : undefined}>{pending} pending</span>}
      qualifier="across every environment"
    />
  )
}

export function ApprovalsActivity() {
  const { data = [] } = useApprovals('all')
  const events = data.slice(0, FEED_DEPTH).map((approval) => ({
    key: `approval-${approval.id}-${approval.status}`,
    icon: GitPullRequest,
    tint: TINT[approval.status] ?? TOOL_ACCENTS.approvals.text,
    noun: 'Approval',
    resource: approval.target,
    env: approval.env,
    actor: approval.status === 'pending' ? approval.requested_by : '',
    detail: DETAIL[approval.status](approval),
    at: approval.reviewed_at ?? approval.requested_at,
    link: { kind: 'approval' as const, id: approval.id },
  }))
  activitySlot.useContribute('approvals', events)
  return null
}
