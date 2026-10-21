import { notifyWithLink } from '@/lib/notify'
import { toast } from '@/lib/toast'
import type { Approval } from '@/types/api'

/** The toast for a decision, in the reviewer's voice. A failed replay is an
 *  error with the API's reason; everything else links the request. */
export function approvalDecided(approval: Approval): void {
  if (approval.status === 'failed') {
    toast.error(`Approved, but ${approval.target} in ${approval.env} was not changed`, {
      description: approval.result ?? 'The change could not be applied.',
    })
    return
  }
  const word =
    approval.status === 'approved'
      ? 'Approved and applied'
      : approval.status === 'rejected'
        ? 'Rejected'
        : 'Withdrawn'
  notifyWithLink({
    type: approval.status === 'approved' ? 'success' : 'info',
    title: `${word}: ${approval.target} in ${approval.env}`,
    resource: { kind: 'approval', id: approval.id },
  })
}
