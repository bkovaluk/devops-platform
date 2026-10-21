import { notifyWithLink } from '@/lib/notify'
import type { FlagChange } from '@/types/api'

export type FlagVerb = 'create' | 'update' | 'delete'

const DONE: Record<FlagVerb, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
}

const REQUESTED: Record<FlagVerb, string> = {
  create: 'Creation',
  update: 'Update',
  delete: 'Deletion',
}

/** The toast for a flag change: the flag's link when it applied, the
 *  request's link when it became an approval. A deleted flag has no page, so
 *  its toast links the list of that env instead. */
export function flagChanged(verb: FlagVerb, key: string, env: string, result: FlagChange): void {
  if (!result.applied) {
    notifyWithLink({
      type: 'info',
      title: `${REQUESTED[verb]} of ${key} requested for ${env}`,
      resource: { kind: 'approval', id: result.approval.id },
      linkLabel: 'Open request',
    })
    return
  }
  if (verb === 'delete') {
    notifyWithLink({ title: `${key} deleted in ${env}`, resource: { kind: 'flags', env } })
    return
  }
  notifyWithLink({
    title: `${key} ${DONE[verb]} in ${env}`,
    resource: { kind: 'flag', key, env },
    linkLabel: 'Open flag',
  })
}
