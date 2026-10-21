/**
 * Every CONTRACT.md route, answered from `db.ts` on the API's own terms:
 * scopes are checked with the same grammar, writes in a direct env apply
 * (200) and everywhere else become approval requests (202), the two-person
 * rule holds, and `X-View-As` is honoured for admins only and read-only.
 *
 * The same handlers serve the browser (`?msw=1`) and the unit tests.
 */
import { delay, HttpResponse, http } from 'msw'
import { type Action, ALL_TOOLS, can, inEnv, type Tool } from '@/features/auth/permissions'
import { VIEW_AS_HEADER } from '@/features/auth/view-as'
import type { AgentStatus, Approval, AuthMe, Flag, FlagChange } from '@/types/api'
import {
  type AgentEvent,
  type AgentWorld,
  agentRun,
  MOCK_MODEL,
  mockAssistantOn,
  type RunInput,
} from './agent'
import { db, evaluationsFor, MOCK_CONFIG, nextApprovalId, withExpiry } from './db'
import { grantsFor, mockPrincipal, personByEmail, personFor } from './principal'

let latencyMs = 0

/** How long every answer waits. The browser mode sets a little, so loading
 *  states are seen; tests leave it at zero. */
export function setLatency(ms: number): void {
  latencyMs = ms
}

interface Caller {
  email: string
  name: string
  scopes: readonly string[]
  isAdmin: boolean
  viewAs: string | null
}

function refuse(status: number, detail: string) {
  return HttpResponse.json({ detail }, { status })
}

/** Who is asking, through whose grants. A refusal of the lens is an answer. */
function callerOf(request: Request): Caller | Response {
  const principal = mockPrincipal()
  const actor = personFor(principal)
  const grants = grantsFor(principal)
  const isAdmin = grants.includes('*')
  const target = request.headers.get(VIEW_AS_HEADER)
  if (!target) {
    return { email: actor.email, name: actor.name, scopes: grants, isAdmin, viewAs: null }
  }
  if (!isAdmin) return refuse(403, 'Only an admin can view as someone else.')
  const person = personByEmail(target)
  if (!person) return refuse(404, `Nobody named ${target} has access here.`)
  const viewed = grantsFor(person.principal)
  return {
    email: person.email,
    name: person.name,
    scopes: viewed,
    isAdmin: viewed.includes('*'),
    viewAs: person.email,
  }
}

const READ_ONLY = 'Viewing as someone is read-only; leave view-as to make changes.'

/** The caller, when they may do `action` with `tool` in `env`; otherwise the refusal. */
function authorizeIn(request: Request, tool: Tool, action: Action, env: string): Caller | Response {
  const caller = callerOf(request)
  if (caller instanceof Response) return caller
  if (!can(caller.scopes, inEnv(tool, action, env))) {
    return refuse(403, `You need ${tool}:${action} in ${env}.`)
  }
  if (request.method !== 'GET' && caller.viewAs) return refuse(403, READ_ONLY)
  return caller
}

/** Whether the caller may see a request: they can read its tool in its env. */
function visible(caller: Caller, approval: Approval): boolean {
  return ALL_TOOLS.some(
    (tool) => tool === approval.tool && can(caller.scopes, inEnv(tool, 'read', approval.env)),
  )
}

function envOf(request: Request, { allowAll }: { allowAll: boolean }): string | Response {
  const env = new URL(request.url).searchParams.get('env')
  if (!env) return refuse(422, 'Name an environment with ?env=.')
  if (env === 'all') return allowAll ? env : refuse(400, 'Pick one environment; all is for lists.')
  if (!MOCK_CONFIG.environments.includes(env))
    return refuse(400, `There is no environment named ${env}.`)
  return env
}

function findFlag(key: string, env: string): Flag | undefined {
  return db.flags.find((flag) => flag.key === key && flag.env === env)
}

function isDirect(env: string): boolean {
  return MOCK_CONFIG.direct_envs.includes(env)
}

function recordApproval(
  caller: Caller,
  env: string,
  action: Approval['action'],
  target: string,
  payload: Record<string, unknown>,
  before: Flag | null,
): Approval {
  const approval: Approval = {
    id: nextApprovalId(),
    env,
    tool: 'flags',
    action,
    target,
    payload,
    before: before ? { ...before } : null,
    status: 'pending',
    requested_by: caller.email,
    requested_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    result: null,
  }
  db.approvals.unshift(approval)
  return approval
}

function fileApproval(...args: Parameters<typeof recordApproval>): Response {
  const body: FlagChange = { applied: false, approval: recordApproval(...args) }
  return HttpResponse.json(body, { status: 202 })
}

/** Apply a flag change to the store. Returns the reason it could not, if any. */
function applyChange(
  action: Approval['action'],
  env: string,
  key: string,
  payload: Record<string, unknown>,
  by: string,
): { flag?: Flag; failure?: string } {
  const existing = findFlag(key, env)
  const stamp = { updated_at: new Date().toISOString(), updated_by: by }
  if (action === 'create') {
    if (existing) return { failure: `${key} already exists in ${env}.` }
    const flag: Flag = {
      key,
      env,
      description: typeof payload.description === 'string' ? payload.description : '',
      enabled: Boolean(payload.enabled),
      rollout_percent: Number(payload.rollout_percent ?? 0),
      owner: typeof payload.owner === 'string' ? payload.owner : '',
      ...stamp,
    }
    db.flags.push(flag)
    return { flag }
  }
  if (!existing) return { failure: `${key} no longer exists in ${env}.` }
  if (action === 'delete') {
    db.flags = db.flags.filter((flag) => flag !== existing)
    return {}
  }
  Object.assign(existing, payload, stamp)
  return { flag: existing }
}

const FLAG_FIELDS = ['description', 'enabled', 'rollout_percent', 'owner'] as const

function pickFlagFields(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    FLAG_FIELDS.filter((field) => field in body).map((field) => [field, body[field]]),
  )
}

function invalidRollout(body: Record<string, unknown>): boolean {
  if (!('rollout_percent' in body)) return false
  const value = body.rollout_percent
  return typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (!text) return {}
  const parsed: unknown = JSON.parse(text)
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
}

const pause = () => (latencyMs > 0 ? delay(latencyMs) : Promise.resolve())

/** The flags tool as the scripted assistant reaches it: as the caller. */
function worldFor(caller: Caller): AgentWorld {
  return {
    environments: MOCK_CONFIG.environments,
    isDirect,
    readOnly: caller.viewAs !== null,
    flags: (env) =>
      can(caller.scopes, inEnv('flags', 'read', env))
        ? db.flags.filter((flag) => flag.env === env).sort((a, b) => a.key.localeCompare(b.key))
        : null,
    pendingApprovals: () =>
      db.approvals
        .filter((approval) => visible(caller, approval))
        .map((approval) => withExpiry(approval))
        .filter((approval) => approval.status === 'pending'),
    canWrite: (env) => can(caller.scopes, inEnv('flags', 'write', env)),
    update: (env, key, changes) => {
      if (caller.viewAs) return READ_ONLY
      if (!can(caller.scopes, inEnv('flags', 'write', env)))
        return `You need flags:write in ${env}.`
      const existing = findFlag(key, env)
      if (!existing) return `No flag ${key} in ${env}.`
      if (invalidRollout(changes)) return 'rollout_percent must be a whole number from 0 to 100.'
      const payload = pickFlagFields(changes)
      if (!isDirect(env)) {
        return {
          applied: false,
          approval: recordApproval(caller, env, 'update', key, payload, existing),
        }
      }
      const { flag, failure } = applyChange('update', env, key, payload, caller.email)
      return flag ? { applied: true, flag } : (failure ?? `${key} could not be changed.`)
    },
  }
}

/** A run's events as Server-Sent Events, a beat apart in the browser so the
 *  answer is seen arriving. */
function eventStream(events: readonly AgentEvent[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        if (latencyMs > 0) await delay(latencyMs / 4)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.close()
    },
  })
  return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}

function isRunInput(body: Record<string, unknown>): body is Record<string, unknown> & RunInput {
  return (
    typeof body.threadId === 'string' &&
    typeof body.runId === 'string' &&
    Array.isArray(body.messages)
  )
}

export const handlers = [
  http.get('*/health', () => HttpResponse.json({ status: 'ok' })),

  http.get('*/config', async () => {
    await pause()
    return HttpResponse.json(MOCK_CONFIG)
  }),

  http.get('*/auth/me', async ({ request }) => {
    await pause()
    const caller = callerOf(request)
    if (caller instanceof Response) return caller
    const me: AuthMe = {
      email: caller.email,
      name: caller.name,
      scopes: [...caller.scopes],
      is_admin: caller.isAdmin,
      view_as: caller.viewAs,
    }
    return HttpResponse.json(me)
  }),

  http.get('*/api/flags', async ({ request }) => {
    await pause()
    const env = envOf(request, { allowAll: true })
    if (env instanceof Response) return env
    const caller = callerOf(request)
    if (caller instanceof Response) return caller
    const readable = MOCK_CONFIG.environments.filter((name) =>
      can(caller.scopes, inEnv('flags', 'read', name)),
    )
    if (env === 'all' && readable.length === 0) {
      return refuse(403, 'You need flags:read in at least one environment to list these.')
    }
    if (env !== 'all' && !readable.includes(env))
      return refuse(403, `You need flags:read in ${env}.`)
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase()
    const flags = db.flags
      .filter((flag) => (env === 'all' ? readable.includes(flag.env) : flag.env === env))
      .filter(
        (flag) =>
          !q ||
          flag.key.includes(q) ||
          flag.description.toLowerCase().includes(q) ||
          flag.owner.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          a.key.localeCompare(b.key) ||
          MOCK_CONFIG.environments.indexOf(a.env) - MOCK_CONFIG.environments.indexOf(b.env),
      )
    return HttpResponse.json(flags)
  }),

  http.get('*/api/flags/:key/evaluations', async ({ request, params }) => {
    await pause()
    const env = envOf(request, { allowAll: false })
    if (env instanceof Response) return env
    const caller = authorizeIn(request, 'flags', 'read', env)
    if (caller instanceof Response) return caller
    const flag = findFlag(String(params.key), env)
    if (!flag) return refuse(404, `No flag ${String(params.key)} in ${env}.`)
    const minutes = Number(new URL(request.url).searchParams.get('minutes') ?? 60)
    return HttpResponse.json(evaluationsFor(flag, Math.min(Math.max(minutes, 1), 1440)))
  }),

  http.get('*/api/flags/:key', async ({ request, params }) => {
    await pause()
    const env = envOf(request, { allowAll: false })
    if (env instanceof Response) return env
    const caller = authorizeIn(request, 'flags', 'read', env)
    if (caller instanceof Response) return caller
    const flag = findFlag(String(params.key), env)
    return flag ? HttpResponse.json(flag) : refuse(404, `No flag ${String(params.key)} in ${env}.`)
  }),

  http.post('*/api/flags', async ({ request }) => {
    await pause()
    const env = envOf(request, { allowAll: false })
    if (env instanceof Response) return env
    const caller = authorizeIn(request, 'flags', 'write', env)
    if (caller instanceof Response) return caller
    const body = await jsonBody(request)
    const key = typeof body.key === 'string' ? body.key : ''
    if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(key))
      return refuse(422, 'The key must be 2 to 63 lower case characters.')
    if (invalidRollout(body))
      return refuse(422, 'rollout_percent must be a whole number from 0 to 100.')
    if (findFlag(key, env)) return refuse(409, `${key} already exists in ${env}.`)
    const payload = { key, ...pickFlagFields(body) }
    if (!isDirect(env)) return fileApproval(caller, env, 'create', key, payload, null)
    const { flag, failure } = applyChange('create', env, key, payload, caller.email)
    if (!flag) return refuse(409, failure ?? `${key} could not be changed.`)
    const result: FlagChange = { applied: true, flag }
    return HttpResponse.json(result)
  }),

  http.put('*/api/flags/:key', async ({ request, params }) => {
    await pause()
    const env = envOf(request, { allowAll: false })
    if (env instanceof Response) return env
    const caller = authorizeIn(request, 'flags', 'write', env)
    if (caller instanceof Response) return caller
    const key = String(params.key)
    const existing = findFlag(key, env)
    if (!existing) return refuse(404, `No flag ${key} in ${env}.`)
    const body = await jsonBody(request)
    if (invalidRollout(body))
      return refuse(422, 'rollout_percent must be a whole number from 0 to 100.')
    const payload = pickFlagFields(body)
    if (!isDirect(env)) return fileApproval(caller, env, 'update', key, payload, existing)
    const { flag, failure } = applyChange('update', env, key, payload, caller.email)
    if (!flag) return refuse(409, failure ?? `${key} could not be changed.`)
    const result: FlagChange = { applied: true, flag }
    return HttpResponse.json(result)
  }),

  http.delete('*/api/flags/:key', async ({ request, params }) => {
    await pause()
    const env = envOf(request, { allowAll: false })
    if (env instanceof Response) return env
    const caller = authorizeIn(request, 'flags', 'write', env)
    if (caller instanceof Response) return caller
    const key = String(params.key)
    const existing = findFlag(key, env)
    if (!existing) return refuse(404, `No flag ${key} in ${env}.`)
    if (!isDirect(env)) return fileApproval(caller, env, 'delete', key, {}, existing)
    applyChange('delete', env, key, {}, caller.email)
    const result: FlagChange = { applied: true, flag: existing }
    return HttpResponse.json(result)
  }),

  http.get('*/api/agent/status', async ({ request }) => {
    await pause()
    const caller = callerOf(request)
    if (caller instanceof Response) return caller
    const status: AgentStatus = mockAssistantOn()
      ? { enabled: true, model: MOCK_MODEL }
      : { enabled: false, model: null }
    return HttpResponse.json(status)
  }),

  http.post('*/api/agent', async ({ request }) => {
    await pause()
    if (!mockAssistantOn()) return refuse(503, 'Assistant is not configured')
    const caller = callerOf(request)
    if (caller instanceof Response) return caller
    const body = await jsonBody(request)
    if (!isRunInput(body)) return refuse(422, 'Send an AG-UI run input: threadId, runId, messages.')
    return eventStream(agentRun(body, worldFor(caller)))
  }),

  http.get('*/api/approvals', async ({ request }) => {
    await pause()
    const caller = callerOf(request)
    if (caller instanceof Response) return caller
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    const approvals = db.approvals
      .filter((approval) => visible(caller, approval))
      .map((approval) => withExpiry(approval))
      .filter((approval) => status === 'all' || approval.status === 'pending')
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))
    return HttpResponse.json(approvals)
  }),

  http.get('*/api/approvals/:id', async ({ request, params }) => {
    await pause()
    const caller = callerOf(request)
    if (caller instanceof Response) return caller
    const approval = db.approvals.find((a) => a.id === params.id)
    return approval && visible(caller, approval)
      ? HttpResponse.json(withExpiry(approval))
      : refuse(404, `No approval request ${String(params.id)}.`)
  }),

  http.post('*/api/approvals/:id/:verb', async ({ request, params }) => {
    await pause()
    const verb = String(params.verb)
    if (!['approve', 'reject', 'withdraw'].includes(verb)) return refuse(404, 'No such action.')
    const caller = callerOf(request)
    if (caller instanceof Response) return caller
    if (caller.viewAs) return refuse(403, READ_ONLY)
    const stored = db.approvals.find((a) => a.id === params.id)
    if (!stored || !visible(caller, stored)) {
      return refuse(404, `No approval request ${String(params.id)}.`)
    }
    // Withdrawing belongs to the requester, whatever else they hold.
    if (verb !== 'withdraw' && !can(caller.scopes, inEnv('approvals', 'review', stored.env))) {
      return refuse(403, `You need approvals:review in ${stored.env}.`)
    }
    const approval = withExpiry(stored)
    if (approval.status !== 'pending') {
      return refuse(409, `This request is already ${approval.status}.`)
    }
    const body = await jsonBody(request)
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
    const decided = {
      reviewed_by: caller.email,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    }

    if (verb === 'withdraw') {
      if (approval.requested_by !== caller.email) {
        return refuse(403, 'Only the requester can withdraw a request.')
      }
      Object.assign(stored, decided, { status: 'withdrawn' })
      return HttpResponse.json(stored)
    }
    if (approval.requested_by === caller.email) {
      return refuse(403, 'A second person has to review this; you filed it.')
    }
    if (verb === 'reject') {
      if (!note) return refuse(422, 'Say why in a note.')
      Object.assign(stored, decided, { status: 'rejected' })
      return HttpResponse.json(stored)
    }
    const { failure } = applyChange(
      approval.action,
      approval.env,
      approval.target,
      approval.payload,
      approval.requested_by,
    )
    Object.assign(stored, decided, {
      status: failure ? 'failed' : 'approved',
      result: failure ?? `Applied to ${approval.env}.`,
    })
    return HttpResponse.json(stored)
  }),
]
