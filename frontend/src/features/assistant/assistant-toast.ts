import { resourceConfig } from '@/components/approvals/resource-registry'
import { notifyWithLink } from '@/lib/notify'
import { toast } from '@/lib/toast'
import { asApproval, type Outcome, type ProposalVerb, type ProposedChange } from './proposal'

const DONE: Record<ProposalVerb, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
}

const REQUESTED: Record<ProposalVerb, string> = {
  create: 'Creation',
  update: 'Update',
  delete: 'Deletion',
}

/** The toast for a confirmed change: the resource's link when it applied, the
 *  request's link when it became an approval. A refusal stays in the thread. */
export function changeAnswered(change: ProposedChange, outcome: Outcome): void {
  const { verb, target, env } = change
  if (outcome.kind === 'requested') {
    notifyWithLink({
      type: 'info',
      title: `${REQUESTED[verb]} of ${target} requested for ${env}`,
      resource: { kind: 'approval', id: outcome.approval.id },
      linkLabel: 'Open request',
    })
    return
  }
  if (outcome.kind !== 'applied') return
  const title = `${target} ${DONE[verb]} in ${env}`
  const resource = resourceConfig(change.tool).link(asApproval(change, 'approved'))
  if (resource) notifyWithLink({ title, resource, linkLabel: 'Open' })
  else toast.success(title)
}
