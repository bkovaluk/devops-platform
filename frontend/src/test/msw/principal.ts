/**
 * Who you are when the API isn't there.
 *
 * Choose a principal from the URL — `?msw=1&as=reviewer` — or from the account
 * menu; the choice sticks to the tab in `sessionStorage`. The names are the
 * contract's seeded roles plus `empty`, a principal with no grants at all, so
 * a scoped shell, an empty one and an admin are each one reload apart.
 *
 * This module touches no MSW API, so the account menu can import it without
 * pulling the mock into the app bundle.
 */
import { CONTRACT } from '@/features/auth/permissions'

const PRINCIPAL_KEY = 'mock-principal'
const ACTIVE_KEY = 'mock-active'

export const EMPTY_PRINCIPAL = 'empty'

/** Every principal the mock can answer as. */
export const MOCK_PRINCIPALS: readonly string[] = [...Object.keys(CONTRACT.roles), EMPTY_PRINCIPAL]

export interface MockPerson {
  email: string
  name: string
  /** The seeded role this person holds, or `empty`. */
  principal: string
}

/** One person per principal, so a request filed as one is reviewable as another. */
export const PEOPLE: readonly MockPerson[] = [
  { email: 'ada@example.com', name: 'Ada Lovelace', principal: 'admin' },
  { email: 'lin@example.com', name: 'Lin Chen', principal: 'editor' },
  { email: 'grace@example.com', name: 'Grace Hopper', principal: 'reviewer' },
  { email: 'alan@example.com', name: 'Alan Kay', principal: 'viewer' },
  { email: 'nobody@example.com', name: 'Nobody Yet', principal: EMPTY_PRINCIPAL },
]

export function personFor(principal: string): MockPerson {
  return (
    PEOPLE.find((person) => person.principal === principal) ?? {
      email: `${principal}@example.com`,
      name: principal,
      principal,
    }
  )
}

export function personByEmail(email: string): MockPerson | null {
  return PEOPLE.find((person) => person.email === email) ?? null
}

export function grantsFor(principal: string): readonly string[] {
  return CONTRACT.roles[principal] ?? []
}

export function mockActive(): boolean {
  return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(ACTIVE_KEY) === '1'
}

export function setMockActive(active: boolean): void {
  if (active) sessionStorage.setItem(ACTIVE_KEY, '1')
  else sessionStorage.removeItem(ACTIVE_KEY)
}

/** The principal this tab answers as: the URL's `as`, else the tab's choice, else admin. */
export function mockPrincipal(): string {
  const asked = new URLSearchParams(window.location.search).get('as')
  if (asked) sessionStorage.setItem(PRINCIPAL_KEY, asked)
  return sessionStorage.getItem(PRINCIPAL_KEY) ?? 'admin'
}

export function setMockPrincipal(principal: string): void {
  sessionStorage.setItem(PRINCIPAL_KEY, principal)
}

/** Answer as someone else from now on. A new principal is a new session, so
 *  the tab starts over rather than reasoning about what it cached. */
export function chooseMockPrincipal(principal: string): void {
  setMockPrincipal(principal)
  const url = new URL(window.location.href)
  url.searchParams.delete('as')
  window.location.assign(url.toString())
}
