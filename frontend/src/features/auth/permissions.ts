/**
 * Scope grammar — `<tool>:<action>[:<env>]`, plus the bare `*` that grants
 * everything. This module owns the vocabulary and the matching rules and
 * nothing else: no React, no fetching.
 *
 * `scope-contract.json` is copied from the repo root (`bun run
 * generate-scope-contract`), where the backend writes it. It is the source of
 * truth for the tools and their actions, the environments that qualify them,
 * the seeded roles and the conformance cases. JSON imports widen to strings,
 * so the unions below are declared here and `permissions.test.ts` asserts they
 * are exactly the contract's: a tool added upstream fails the suite rather
 * than silently hiding a grant.
 *
 * Matching, as the API decides it:
 *   - a requirement names exactly what is being attempted and never carries
 *     `*`; one about a single environment carries that environment;
 *   - a grant may widen its action with `*`; the bare `*` is the only way to
 *     widen the tool, and the environment never wildcards;
 *   - an unqualified grant covers every environment; a qualified one covers
 *     only its own, and never an unqualified requirement;
 *   - anything outside the grammar satisfies nothing.
 */
import contract from './scope-contract.json'

interface ScopeContract {
  version: number
  wildcard: string
  grammar: string
  tools: Readonly<Record<string, readonly string[]>>
  qualifiers: readonly string[]
  roles: Readonly<Record<string, readonly string[]>>
  invalid_grants: readonly string[]
  invalid_requirements: readonly string[]
  cases: readonly { grant: string; required: string; expected: boolean | string }[]
}

/** One row of the matching table. `'invalid'` means the pair never parses. */
export interface ConformanceCase {
  grant: string
  required: string
  expected: boolean | 'invalid'
}

export const CONTRACT: ScopeContract = contract

export const ADMIN_SCOPE = '*'

/** Every tool the API grants against. */
export type Tool = 'flags' | 'approvals' | 'findings'

export type Action = 'read' | 'write' | 'review'

/** A requirement: concrete in every segment, optionally narrowed to one env. */
export type Scope = `${Tool}:${Action}` | `${Tool}:${Action}:${string}`

interface Parsed {
  tool: string
  action: string
  qualifier: string | null
}

const WILDCARD = CONTRACT.wildcard

export const ALL_TOOLS = Object.keys(CONTRACT.tools) as readonly Tool[]

export const CONFORMANCE_CASES = CONTRACT.cases as readonly ConformanceCase[]

function segments(raw: string): string[] | null {
  const parts = raw.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  if (parts.some((part) => part === '')) return null
  return parts
}

function known(tool: string, action: string, qualifier: string | null): boolean {
  const actions = CONTRACT.tools[tool]
  if (!actions) return false
  if (action !== WILDCARD && !actions.includes(action)) return false
  return qualifier === null || CONTRACT.qualifiers.includes(qualifier)
}

/** A requirement, or null when the string is not one. */
export function parseScope(scope: string): Parsed | null {
  const parts = segments(scope)
  if (!parts || parts.includes(WILDCARD)) return null
  const [tool = '', action = '', qualifier = null] = parts
  return known(tool, action, qualifier) ? { tool, action, qualifier } : null
}

/** A grant, or null when the string is not one. */
export function parseGrant(grant: string): Parsed | null {
  if (grant === WILDCARD) return { tool: WILDCARD, action: WILDCARD, qualifier: null }
  const parts = segments(grant)
  if (!parts) return null
  const [tool = '', action = '', qualifier = null] = parts
  if (tool === WILDCARD || qualifier === WILDCARD) return null
  return known(tool, action, qualifier) ? { tool, action, qualifier } : null
}

/** Whether holding `grant` is enough to meet `required`. */
export function satisfies(grant: string, required: string): boolean {
  const g = parseGrant(grant)
  const r = parseScope(required)
  if (!g || !r) return false
  if (g.tool === WILDCARD) return true
  if (g.tool !== r.tool) return false
  if (g.action !== WILDCARD && g.action !== r.action) return false
  return g.qualifier === null || g.qualifier === r.qualifier
}

/** `<tool>:<action>:<env>` — the requirement for doing one thing in one env. */
export function inEnv(tool: Tool, action: Action, env: string): Scope {
  return `${tool}:${action}:${env}`
}

/** The same thing in any of the contract's environments: holding one is enough
 *  to reach a list, which then answers only for the envs it covers. */
export function inAnyEnv(tool: Tool, action: Action): readonly Scope[] {
  return CONTRACT.qualifiers.map((env) => inEnv(tool, action, env))
}

export function isAdminGrantSet(grants: readonly string[]): boolean {
  return grants.includes(ADMIN_SCOPE)
}

export function can(grants: readonly string[], required: Scope): boolean {
  return grants.some((grant) => satisfies(grant, required))
}

/** Any-of: the one place that rule is spelled. */
export function canAny(grants: readonly string[], required: readonly Scope[]): boolean {
  return required.some((scope) => can(grants, scope))
}

/** The grants that bear on `tool`: its own, plus the bare `*`. */
export function grantsForTool(grants: readonly string[], tool: Tool): readonly string[] {
  return grants.filter((grant) => {
    const parsed = parseGrant(grant)
    return parsed !== null && (parsed.tool === WILDCARD || parsed.tool === tool)
  })
}

/** What the registry and the surfaces ask of a principal. */
export interface Grants {
  can: (required: Scope) => boolean
  canAny: (required: readonly Scope[]) => boolean
}

export function grantsOf(scopes: readonly string[]): Grants {
  return {
    can: (required) => can(scopes, required),
    canAny: (required) => canAny(scopes, required),
  }
}
