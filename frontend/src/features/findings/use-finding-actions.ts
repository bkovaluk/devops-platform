/**
 * Reviewing a finding: acknowledge it, or close it with a verdict.
 *
 * A review records a person's verdict on the agent's own output and changes
 * nothing the finding is about, so it applies at once in every environment;
 * nothing here files an approval. The answer is the finding as it now stands,
 * so the detail is written into the cache and the lists are re-read.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useIdentityBoundMutation } from '@/features/auth/use-identity-bound-mutation'
import { notifyFailure } from '@/lib/notify'
import type { FindingDetail, ResolveFindingBody } from '@/types/api'
import { acknowledgeFinding, closeFinding, findingKeys } from './findings-api'
import { findingReviewed } from './findings-toast'

interface Target {
  env: string
  id: string
}

export function useFindingActions() {
  const client = useQueryClient()

  const settle = (finding: FindingDetail) => {
    client.setQueryData(findingKeys.detail(finding.env, finding.finding_id), finding)
    findingReviewed(finding)
    return client.invalidateQueries({ queryKey: findingKeys.lists() })
  }

  const acknowledge = useIdentityBoundMutation({
    mutationFn: ({ env, id }: Target) => acknowledgeFinding(env, id),
    onSuccess: (finding) => settle(finding),
    onError: (error, { id, env }) => notifyFailure(`Couldn't acknowledge ${id} in ${env}`, error),
  })

  const close = useIdentityBoundMutation({
    mutationFn: ({ env, id, body }: Target & { body: ResolveFindingBody }) =>
      closeFinding(env, id, body),
    onSuccess: (finding) => settle(finding),
  })

  return {
    acknowledging: acknowledge.isPending,
    closing: close.isPending,
    acknowledge: (env: string, id: string) => acknowledge.mutate({ env, id }),
    /** Rejects with the API's refusal, for the dialog to say in place. */
    close: (env: string, id: string, body: ResolveFindingBody) =>
      close.mutateAsync({ env, id, body }),
  }
}
