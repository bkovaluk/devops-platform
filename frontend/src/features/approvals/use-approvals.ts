import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useIdentityBoundMutation } from '@/features/auth/use-identity-bound-mutation'
import { apiFetch, query } from '@/lib/api-client'
import { notifyFailure } from '@/lib/notify'
import type { Approval } from '@/types/api'
import { approvalDecided } from './approval-toast'

export type ApprovalListStatus = 'pending' | 'all'

export const approvalKeys = {
  all: ['approvals'] as const,
  list: (status: ApprovalListStatus) => [...approvalKeys.all, 'list', status] as const,
}

/** Pending requests age; the inbox re-reads often enough to see a teammate's decision. */
const INBOX_REFRESH_MS = 30_000

export function useApprovals(status: ApprovalListStatus) {
  return useQuery({
    queryKey: approvalKeys.list(status),
    queryFn: () => apiFetch<Approval[]>(`/api/approvals${query({ status })}`),
    refetchInterval: INBOX_REFRESH_MS,
  })
}

/** Waiting on a second pair of eyes, in every env. */
export function usePendingCount(): number {
  return useApprovals('pending').data?.length ?? 0
}

function decide(id: string, verb: 'approve' | 'reject' | 'withdraw', note?: string) {
  return apiFetch<Approval>(`/api/approvals/${encodeURIComponent(id)}/${verb}`, {
    method: 'POST',
    body: verb === 'withdraw' ? undefined : { note },
  })
}

/** Approve, reject (with a note) and withdraw. Each settles the inbox and,
 *  for an approval that replayed a change, every tool's cache it touched. */
export function useApprovalDecisions() {
  const client = useQueryClient()
  const settle = (approval: Approval) => {
    approvalDecided(approval)
    void client.invalidateQueries({ queryKey: approvalKeys.all })
    if (approval.status === 'approved') void client.invalidateQueries({ queryKey: [approval.tool] })
  }

  const approve = useIdentityBoundMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => decide(id, 'approve', note),
    onSuccess: settle,
    onError: (error) => notifyFailure("Couldn't approve the request", error),
  })
  const reject = useIdentityBoundMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => decide(id, 'reject', note),
    onSuccess: settle,
    onError: (error) => notifyFailure("Couldn't reject the request", error),
  })
  const withdraw = useIdentityBoundMutation({
    mutationFn: ({ id }: { id: string }) => decide(id, 'withdraw'),
    onSuccess: settle,
    onError: (error) => notifyFailure("Couldn't withdraw the request", error),
  })

  return { approve, reject, withdraw }
}
