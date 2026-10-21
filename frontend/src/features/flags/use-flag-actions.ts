/**
 * The approval-aware action surface for flags.
 *
 * Call sites never branch on the environment. In a direct env the API applies
 * the change and answers `applied: true`; anywhere else it files an approval
 * and answers `applied: false`. This hook reads which happened and does the
 * rest: the right caches invalidated, and the right toast — a link to the
 * flag, or a link to the request a teammate now has to review. `needsApproval`
 * is the same answer ahead of time, for the guard rails a form shows before
 * anyone presses submit.
 *
 * A new tool copies this shape: one hook, one mutation per verb, every one of
 * them through `useIdentityBoundMutation`.
 */
import { useQueryClient } from '@tanstack/react-query'
import { approvalKeys } from '@/features/approvals/use-approvals'
import { useIdentityBoundMutation } from '@/features/auth/use-identity-bound-mutation'
import { needsApproval } from '@/features/auth/use-needs-approval'
import { useConfig } from '@/features/config/use-config'
import { notifyFailure } from '@/lib/notify'
import type { FlagChange, FlagCreate, FlagUpdate } from '@/types/api'
import { createFlag, deleteFlag, flagKeys, updateFlag } from './flags-api'
import { flagChanged, type FlagVerb } from './flag-toast'

interface Target {
  key: string
  env: string
}

export function useFlagActions() {
  const client = useQueryClient()
  const { data: config } = useConfig()

  const settle = (verb: FlagVerb, target: Target, result: FlagChange) => {
    flagChanged(verb, target.key, target.env, result)
    if (result.applied) return client.invalidateQueries({ queryKey: flagKeys.all })
    return client.invalidateQueries({ queryKey: approvalKeys.all })
  }

  const create = useIdentityBoundMutation({
    mutationFn: ({ env, body }: { env: string; body: FlagCreate }) => createFlag(env, body),
    onSuccess: (result, { env, body }) => settle('create', { key: body.key, env }, result),
    onError: (error, { env, body }) =>
      notifyFailure(`Couldn't create ${body.key} in ${env}`, error),
  })

  const update = useIdentityBoundMutation({
    mutationFn: ({ key, env, body }: Target & { body: FlagUpdate }) => updateFlag(key, env, body),
    onSuccess: (result, target) => settle('update', target, result),
    onError: (error, { key, env }) => notifyFailure(`Couldn't update ${key} in ${env}`, error),
  })

  const remove = useIdentityBoundMutation({
    mutationFn: ({ key, env }: Target) => deleteFlag(key, env),
    onSuccess: (result, target) => settle('delete', target, result),
    onError: (error, { key, env }) => notifyFailure(`Couldn't delete ${key} in ${env}`, error),
  })

  return {
    needsApproval: (env: string) => needsApproval(env, config?.direct_envs),
    isPending: create.isPending || update.isPending || remove.isPending,
    create: (env: string, body: FlagCreate) => create.mutateAsync({ env, body }),
    update: (key: string, env: string, body: FlagUpdate) => update.mutateAsync({ key, env, body }),
    remove: (key: string, env: string) => remove.mutateAsync({ key, env }),
  }
}
