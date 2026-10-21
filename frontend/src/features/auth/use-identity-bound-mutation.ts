/**
 * A mutation that belongs, start to finish, to the identity that asked for it.
 *
 * Three things outlive the press. `onMutate` may await before it writes an
 * optimistic value; the request may be retried, or paused offline and resumed
 * minutes later; `onError` rolls back and `onSuccess` invalidates. By then the
 * tab may be answering as somebody else. `identity-cache` empties the cache at
 * each such boundary — this is what stops the work in flight from sending
 * under the new identity or filling the cache back in with the old one's rows.
 *
 * The identity is read when an execution starts and carried through its whole
 * life, so concurrent mutations are each judged against their own beginning.
 * Every write in the app goes through here; `no-direct-use-mutation.test.ts`
 * and the lint rule refuse `useMutation` anywhere else.
 */
import {
  type DefaultError,
  type MutationFunctionContext,
  type UseMutationOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { IdentityChangedError } from '@/lib/api-client'
import { identityGeneration } from './identity-generation'

/** Whether this mutation may still act; throws when it may not. Ask again
 *  after every await. */
export type EnsureCurrent = () => void

type Retry<TError> = boolean | number | ((failureCount: number, error: TError) => boolean)

function shouldRetry<TError>(
  retry: Retry<TError> | undefined,
  failureCount: number,
  error: TError,
): boolean {
  if (typeof retry === 'function') return retry(failureCount, error)
  if (typeof retry === 'number') return failureCount < retry
  return retry ?? false
}

interface IdentityBound<TOnMutateResult> {
  readonly startedUnder: number
  readonly own: TOnMutateResult | undefined
}

type IdentityBoundOptions<TData, TError, TVariables, TOnMutateResult> = Omit<
  UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  'mutationFn' | 'onMutate' | 'onSuccess'
> & {
  mutationFn: (variables: TVariables, ensureCurrent: EnsureCurrent) => Promise<TData>
  onMutate?: (
    variables: TVariables,
    ensureCurrent: EnsureCurrent,
  ) => Promise<TOnMutateResult> | TOnMutateResult
} & Pick<UseMutationOptions<TData, TError, TVariables, TOnMutateResult | undefined>, 'onSuccess'>

/**
 * The identity each execution began under, keyed by the context object
 * TanStack builds once per execution and hands to both `onMutate` and
 * `mutationFn` — which is what lets a retry be judged against the press.
 */
const executionOrigins = new WeakMap<MutationFunctionContext, number>()

function beganUnder(context: MutationFunctionContext): number {
  const seen = executionOrigins.get(context)
  if (seen !== undefined) return seen
  const began = identityGeneration()
  executionOrigins.set(context, began)
  return began
}

function guardFor(context: MutationFunctionContext): EnsureCurrent {
  const began = beganUnder(context)
  return () => {
    if (identityGeneration() !== began) {
      throw new IdentityChangedError('Change cancelled: identity changed')
    }
  }
}

export function useIdentityBoundMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>(
  options: IdentityBoundOptions<TData, TError, TVariables, TOnMutateResult>,
): UseMutationResult<TData, TError, TVariables, IdentityBound<TOnMutateResult>> {
  const { mutationFn, onMutate, onSuccess, onError, onSettled, retry, ...rest } = options
  const inheritedRetry = useQueryClient().getDefaultOptions().mutations?.retry as
    | Retry<TError>
    | undefined

  const current = (bound: IdentityBound<TOnMutateResult> | undefined) =>
    bound !== undefined && bound.startedUnder === identityGeneration()

  return useMutation<TData, TError, TVariables, IdentityBound<TOnMutateResult>>({
    ...rest,
    // Once the identity has moved there is no same request left to retry.
    retry: (failureCount, error) => {
      if (error instanceof IdentityChangedError) return false
      return shouldRetry(retry ?? inheritedRetry, failureCount, error)
    },
    mutationFn: (variables, context) => {
      const ensureCurrent = guardFor(context)
      ensureCurrent()
      return mutationFn(variables, ensureCurrent)
    },
    onMutate: async (variables, context) => ({
      startedUnder: beganUnder(context),
      own: await onMutate?.(variables, guardFor(context)),
    }),
    onSuccess: (data, variables, bound, context) => {
      if (!current(bound)) return
      return onSuccess?.(data, variables, bound?.own, context)
    },
    onError: (error, variables, bound, context) => {
      if (!current(bound)) return
      return onError?.(error, variables, bound?.own, context)
    },
    onSettled: (data, error, variables, bound, context) => {
      if (!current(bound)) return
      return onSettled?.(data, error, variables, bound?.own, context)
    },
  })
}
