/**
 * A change the assistant proposes, and what became of it.
 *
 * A write ends the agent's run with an interrupt whose metadata names the AI
 * action, the env, the target and the resource before and after. The card
 * draws it through the approvals resource registry, so a proposal and a filed
 * request read the same; the registry knows a tool by its API name (`flags`)
 * and an AI action by the noun it acts on (`update_flag` acts on a `flag`).
 */
import type { Interrupt } from '@ag-ui/client'
import { RESOURCE_REGISTRY } from '@/components/approvals/resource-registry'
import type { Approval, ApprovalStatus } from '@/types/api'

export type ProposalVerb = 'create' | 'update' | 'delete'

export interface ProposedChange {
  /** The AI action that makes it: `update_flag`. */
  action: string
  /** The API tool it belongs to: `flags`. */
  tool: string
  verb: ProposalVerb
  env: string
  target: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export type Decision = 'pending' | 'confirmed' | 'cancelled'

export interface Proposal {
  interruptId: string
  toolCallId: string
  change: ProposedChange
  decision: Decision
  /** Whether the decision has gone to the agent. */
  answered: boolean
}

const VERBS: readonly ProposalVerb[] = ['create', 'update', 'delete']

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** `update_flag` → the `update` of a `flags` resource. */
function splitAction(action: string): { verb: ProposalVerb; tool: string } | null {
  const [verb, ...rest] = action.split('_')
  const noun = rest.join('_')
  if (!noun || !VERBS.includes(verb as ProposalVerb)) return null
  const tool = Object.entries(RESOURCE_REGISTRY).find(([, entry]) => entry.noun === noun)?.[0]
  return { verb: verb as ProposalVerb, tool: tool ?? noun }
}

/** The change an interrupt asks about, or null when it is not a tool approval. */
export function proposalOf(interrupt: Interrupt): Proposal | null {
  const meta = record(interrupt.metadata)
  if (!meta || !interrupt.toolCallId) return null
  const { tool: action, env, target } = meta
  if (typeof action !== 'string' || typeof env !== 'string' || typeof target !== 'string')
    return null
  const split = splitAction(action)
  if (!split) return null
  return {
    interruptId: interrupt.id,
    toolCallId: interrupt.toolCallId,
    change: {
      action,
      ...split,
      env,
      target,
      before: record(meta.before),
      after: record(meta.after),
    },
    decision: 'pending',
    answered: false,
  }
}

/** The change in the shape the resource registry renders and links. */
export function asApproval(change: ProposedChange, status: ApprovalStatus): Approval {
  return {
    id: '',
    env: change.env,
    tool: change.tool,
    action: change.verb,
    target: change.target,
    payload: change.after ?? {},
    before: change.before,
    status,
    requested_by: '',
    requested_at: '',
  }
}

/** What answering a proposal did, read from the tool's result. */
export type Outcome =
  | { kind: 'applied' }
  | { kind: 'requested'; approval: Approval }
  | { kind: 'refused'; reason: string }

export function outcomeOf(content: string): Outcome {
  try {
    const parsed = record(JSON.parse(content))
    if (parsed?.applied === true) return { kind: 'applied' }
    if (parsed?.applied === false && record(parsed.approval)) {
      return { kind: 'requested', approval: parsed.approval as Approval }
    }
  } catch {
    // A sentence, not a result: the change was refused or cancelled.
  }
  return { kind: 'refused', reason: content }
}
