/* eslint-disable react-refresh/only-export-components --
 * The configs and the lookup ship from one module, so every approval surface
 * consults the same table. */

/**
 * How each tool's approval requests render — the single source of truth.
 *
 * The inbox, Home's feed and the toasts never branch on `approval.tool`; they
 * ask `resourceConfig(tool)` and let the entry decide the icon, the words,
 * the link and the before/after diff. A new approval-eligible tool is one
 * entry here plus its API contract.
 */
import { Flag, GitPullRequest } from 'lucide-react'
import type { ElementType, ReactNode } from 'react'
import type { ResourceLink } from '@/lib/resource-links'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { cn } from '@/lib/utils'
import type { Approval } from '@/types/api'

export interface ResourceConfig {
  icon: ElementType
  /** The tool's accent, on the icon. */
  tint: string
  /** Singular, for prose: "flag". */
  noun: string
  /** The row's title: "Update flag". */
  actionLabel: (action: string) => string
  /** After "requested": "an update to a flag". */
  actionPhrase: (action: string) => string
  /** Where the request's subject lives, or null when it does not exist yet
   *  (a pending create) or any more (an applied delete). */
  link: (approval: Approval) => ResourceLink | null
  /** The expanded row's before/after block. */
  renderDiff: (approval: Approval) => ReactNode
}

export interface DiffField {
  key: string
  label: string
  format: (value: unknown) => string
}

/** What changed, field by field: the stored `before` beside the requested
 *  `payload`. A field the request does not touch keeps its before value and
 *  reads as unchanged. */
export function FieldDiff({
  fields,
  before,
  after,
}: {
  fields: readonly DiffField[]
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}) {
  return (
    <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
      <dt className="column-label">Field</dt>
      <dd className="column-label">Before</dd>
      <dd className="column-label">After</dd>
      {fields.map((field) => {
        const was = before?.[field.key]
        const requested = after === null ? undefined : (after[field.key] ?? was)
        const changed = after === null || before === null || requested !== was
        return (
          <div key={field.key} className="contents">
            <dt className="field-label py-0.5">{field.label}</dt>
            <dd
              className={cn(
                'mono min-w-0 truncate py-0.5',
                changed && before !== null
                  ? 'text-state-bad line-through decoration-1'
                  : 'text-muted-foreground',
              )}
            >
              {before === null ? '—' : field.format(was)}
            </dd>
            <dd
              className={cn(
                'mono min-w-0 truncate py-0.5',
                changed && after !== null ? 'text-state-ok' : 'text-muted-foreground',
              )}
            >
              {after === null ? 'Deleted' : field.format(requested)}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) || '—' : '—'

const FLAG_FIELDS: readonly DiffField[] = [
  { key: 'enabled', label: 'State', format: (value) => (value ? 'On' : 'Off') },
  { key: 'rollout_percent', label: 'Rollout', format: (value) => `${text(value)}%` },
  { key: 'description', label: 'Description', format: text },
  { key: 'owner', label: 'Owner', format: text },
]

/** An action as a verb at the head of a title: "update" → "Update". */
function verbOf(action: string): string {
  return action.charAt(0).toUpperCase() + action.slice(1)
}

const FLAG_PHRASE: Readonly<Record<string, string>> = {
  create: 'a new flag',
  update: 'an update',
  delete: 'a deletion',
}

/** Keyed by the API's tool name. A request from a tool with no entry still
 *  renders, plainly, through `UNREGISTERED`. */
export const RESOURCE_REGISTRY: Readonly<Record<string, ResourceConfig>> = {
  flags: {
    icon: Flag,
    tint: TOOL_ACCENTS.flags.text,
    noun: 'flag',
    actionLabel: (action) => `${verbOf(action)} flag`,
    actionPhrase: (action) => FLAG_PHRASE[action] ?? `a ${action}`,
    link: (approval) => {
      const exists =
        approval.action === 'update' ||
        (approval.action === 'create' && approval.status === 'approved') ||
        (approval.action === 'delete' && approval.status !== 'approved')
      return exists ? { kind: 'flag', key: approval.target, env: approval.env } : null
    },
    renderDiff: (approval) => (
      <FieldDiff
        fields={FLAG_FIELDS}
        before={approval.before}
        after={approval.action === 'delete' ? null : approval.payload}
      />
    ),
  },
}

const UNREGISTERED: ResourceConfig = {
  icon: GitPullRequest,
  tint: 'text-muted-foreground',
  noun: 'resource',
  actionLabel: verbOf,
  actionPhrase: (action) => `a ${action}`,
  link: () => null,
  renderDiff: (approval) => (
    <pre className="mono overflow-x-auto text-xs text-muted-foreground">
      {JSON.stringify({ before: approval.before, payload: approval.payload }, null, 2)}
    </pre>
  ),
}

export function resourceConfig(tool: string): ResourceConfig {
  return RESOURCE_REGISTRY[tool] ?? UNREGISTERED
}
