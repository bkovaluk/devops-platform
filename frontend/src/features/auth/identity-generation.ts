/**
 * One number for "who is asking, and through whose grants".
 *
 * Three things end an identity in a tab: the account changes (a sign-in or a
 * sign-out), the lens changes (an admin starts or stops viewing as somebody),
 * and a grant is taken away while the same person stays signed in. Anything
 * in flight — a request, a retry, a mutation's rollback — belongs to the
 * identity that started it and must be able to tell it has been outlived.
 *
 * The three counters only count up, so their sum moves whenever any of them
 * does and never returns to a value the tab has already been at.
 */
import { useAuthStore } from './auth-store'
import { lensGeneration } from './view-as'

let revocationsCrossed = 0

export function accountGeneration(): number {
  return useAuthStore.getState().generation
}

/** The identity behind anything currently in flight. */
export function identityGeneration(): number {
  return accountGeneration() + lensGeneration() + revocationsCrossed
}

/** A revocation narrowed the shell: the grants that paid for the work in
 *  flight are gone, though the account and the lens have not moved. */
export function markRevocation(): void {
  revocationsCrossed += 1
}
