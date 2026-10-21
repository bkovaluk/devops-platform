/**
 * The assistant, scripted. `POST /api/agent` answers in AG-UI over
 * Server-Sent Events with the events the API's agent sends, so the dock runs
 * its whole flow with no model: a question is a read (`list_flags`,
 * `get_flag`, `list_approvals`) and a short answer; a request to set a flag
 * proposes `update_flag` and ends the run with an interrupt; the run that
 * answers it applies the change, files an approval, or leaves it.
 *
 * `?assistant=off` turns the assistant off for the tab, as an API with no
 * `AGENT_MODEL` would (`?assistant=on` turns it back on).
 */
import type { Approval, Flag, FlagChange } from '@/types/api'

const ASSISTANT_KEY = 'mock-assistant'

export const MOCK_MODEL = 'scripted'

export function mockAssistantOn(): boolean {
  const asked = new URLSearchParams(window.location.search).get('assistant')
  if (asked === 'off') sessionStorage.setItem(ASSISTANT_KEY, 'off')
  if (asked === 'on') sessionStorage.removeItem(ASSISTANT_KEY)
  return sessionStorage.getItem(ASSISTANT_KEY) !== 'off'
}

export function setMockAssistant(on: boolean): void {
  if (on) sessionStorage.removeItem(ASSISTANT_KEY)
  else sessionStorage.setItem(ASSISTANT_KEY, 'off')
}

/** One AG-UI event as it travels. */
export type AgentEvent = { type: string } & Record<string, unknown>

interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

interface RunMessage {
  id: string
  role: string
  content?: unknown
  toolCalls?: ToolCall[]
}

interface ResumeAnswer {
  interruptId: string
  status: 'resolved' | 'cancelled'
  payload?: { approved?: boolean }
}

export interface RunInput {
  threadId: string
  runId: string
  messages: RunMessage[]
  resume?: ResumeAnswer[]
}

/** What the script may see and do, as the caller. */
export interface AgentWorld {
  environments: readonly string[]
  isDirect: (env: string) => boolean
  readOnly: boolean
  /** The flags in `env` the caller can read; null when they cannot. */
  flags: (env: string) => Flag[] | null
  pendingApprovals: () => Approval[]
  canWrite: (env: string) => boolean
  /** Make the change as the caller, or say why not. */
  update: (env: string, key: string, changes: Record<string, unknown>) => FlagChange | string
}

const WRITE_WORDS = /\b(set|roll|raise|lower|change|update|turn|enable|disable)\b/

function words(text: string): string[] {
  return text.match(/\S+\s*/g) ?? []
}

function said(text: string): AgentEvent[] {
  const messageId = crypto.randomUUID()
  return [
    { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
    ...words(text).map((delta) => ({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta })),
    { type: 'TEXT_MESSAGE_END', messageId },
  ]
}

function returned(toolCallId: string, result: unknown): AgentEvent {
  return {
    type: 'TOOL_CALL_RESULT',
    messageId: crypto.randomUUID(),
    toolCallId,
    content: typeof result === 'string' ? result : JSON.stringify(result),
    role: 'tool',
  }
}

function called(
  name: string,
  args: Record<string, unknown>,
  parentMessageId: string,
): { toolCallId: string; events: AgentEvent[] } {
  const toolCallId = `call-${crypto.randomUUID().slice(0, 8)}`
  return {
    toolCallId,
    events: [
      { type: 'TOOL_CALL_START', toolCallId, toolCallName: name, parentMessageId },
      { type: 'TOOL_CALL_ARGS', toolCallId, delta: JSON.stringify(args) },
      { type: 'TOOL_CALL_END', toolCallId },
    ],
  }
}

/** A turn that only calls a tool, then the tool's answer. */
function toolTurn(name: string, args: Record<string, unknown>, result: unknown): AgentEvent[] {
  const messageId = crypto.randomUUID()
  const { toolCallId, events } = called(name, args, messageId)
  return [
    { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
    { type: 'TEXT_MESSAGE_END', messageId },
    ...events,
    returned(toolCallId, result),
  ]
}

function reading(flag: Flag): string {
  return flag.enabled ? `on at ${flag.rollout_percent}%` : 'off'
}

function lastUserText(messages: readonly RunMessage[]): string {
  const last = messages.filter((message) => message.role === 'user').at(-1)
  return typeof last?.content === 'string' ? last.content.toLowerCase() : ''
}

function changesIn(text: string): Record<string, unknown> | null {
  if (!WRITE_WORDS.test(text)) return null
  const percent = /(\d{1,3})\s*%/.exec(text)
  if (percent) return { rollout_percent: Number(percent[1]) }
  if (/\b(turn on|enable)\b/.test(text)) return { enabled: true }
  if (/\b(turn off|disable)\b/.test(text)) return { enabled: false }
  return null
}

function propose(
  world: AgentWorld,
  env: string,
  key: string,
  changes: Record<string, unknown>,
): AgentEvent[] {
  if (world.readOnly) {
    return said(`You are viewing as someone else, which is read-only, so I can't change ${key}.`)
  }
  const args = { env, key, changes }
  if (!world.canWrite(env)) {
    const refusal = `You need flags:write in ${env}.`
    return [
      ...toolTurn('update_flag', args, refusal),
      ...said(`I can't change ${key} in ${env}: ${refusal}`),
    ]
  }
  const before = world.flags(env)?.find((flag) => flag.key === key)
  if (!before) {
    const missing = `No flag ${key} in ${env}.`
    return [...toolTurn('update_flag', args, missing), ...said(missing)]
  }
  const route = world.isDirect(env)
    ? `A change in ${env} applies at once.`
    : `A change in ${env} files an approval request, and a teammate decides it.`
  const prelude = said(`${key} in ${env} is ${reading(before)}. ${route} Confirm it below.`)
  const { toolCallId, events } = called('update_flag', args, String(prelude[0]?.messageId))
  return [
    ...prelude,
    ...events,
    {
      type: 'RUN_FINISHED',
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: `int-${toolCallId}`,
            reason: 'tool_call',
            message: `Approve update_flag(${JSON.stringify(args)})?`,
            toolCallId,
            responseSchema: {
              type: 'object',
              properties: { approved: { type: 'boolean' } },
              required: ['approved'],
            },
            metadata: {
              tool: 'update_flag',
              env,
              target: key,
              before,
              after: { ...before, ...changes },
            },
          },
        ],
      },
    },
  ]
}

function ask(text: string, world: AgentWorld): AgentEvent[] {
  const env = world.environments.find((name) => new RegExp(`\\b${name}\\b`).test(text)) ?? 'staging'
  const flags = world.flags(env)
  const key =
    flags?.find((flag) => text.includes(flag.key))?.key ??
    (/\bcheckout\b/.test(text) ? 'checkout-v2' : null)
  const changes = changesIn(text)
  if (changes && key) return propose(world, env, key, changes)

  if (/\b(approvals?|requests?|review)\b/.test(text)) {
    const pending = world.pendingApprovals()
    const summary = pending.length
      ? `${pending.length} requests are waiting for review: ${pending
          .map((a) => `${a.action} ${a.target} in ${a.env}`)
          .join(', ')}.`
      : 'Nothing is waiting for review.'
    return [...toolTurn('list_approvals', { status: 'pending' }, pending), ...said(summary)]
  }

  if (flags === null) return said(`You can't read flags in ${env}, so I can't either.`)

  const flag = flags.find((f) => f.key === key)
  if (flag) {
    return [
      ...toolTurn('get_flag', { env, key: flag.key }, flag),
      ...said(`${flag.key} in ${env} is ${reading(flag)}, owned by ${flag.owner}.`),
    ]
  }

  const on = flags.filter((f) => f.enabled)
  const partial = on.filter((f) => f.rollout_percent < 100)
  const rolling = partial.length
    ? `Rolling out: ${partial.map((f) => `${f.key} at ${f.rollout_percent}%`).join(', ')}.`
    : 'Every flag that is on is fully rolled out.'
  return [
    ...toolTurn('list_flags', { env }, flags),
    ...said(`${env} has ${flags.length} flags, ${on.length} of them on. ${rolling}`),
  ]
}

function answer(input: RunInput, world: AgentWorld): AgentEvent[] {
  const calls = input.messages.flatMap((message) => message.toolCalls ?? [])
  return (input.resume ?? []).flatMap((entry) => {
    const toolCallId = entry.interruptId.replace(/^int-/, '')
    const call = calls.find((c) => c.id === toolCallId)
    if (!call) return said('That proposal is no longer open.')
    const { env, key, changes } = JSON.parse(call.function.arguments) as {
      env: string
      key: string
      changes: Record<string, unknown>
    }
    if (entry.status !== 'resolved' || entry.payload?.approved !== true) {
      return [returned(toolCallId, 'Cancelled by user.'), ...said(`Left ${key} as it was.`)]
    }
    const result = world.update(env, key, changes)
    const summary =
      typeof result === 'string'
        ? `That didn't go through. ${result}`
        : result.applied
          ? `Done. ${key} in ${env} is now ${reading(result.flag)}.`
          : `Filed request ${result.approval.id} for ${env}. Nothing changes there until a teammate approves it.`
    return [returned(toolCallId, result), ...said(summary)]
  })
}

/** Every event of one run, in order. */
export function agentRun(input: RunInput, world: AgentWorld): AgentEvent[] {
  const { threadId, runId } = input
  const body = input.resume?.length
    ? answer(input, world)
    : ask(lastUserText(input.messages), world)
  const interrupted = body.find((event) => event.type === 'RUN_FINISHED')
  const steps = body.filter((event) => event !== interrupted)
  return [
    { type: 'RUN_STARTED', threadId, runId },
    ...steps,
    { type: 'RUN_FINISHED', threadId, runId, outcome: { type: 'success' }, ...interrupted },
  ]
}
