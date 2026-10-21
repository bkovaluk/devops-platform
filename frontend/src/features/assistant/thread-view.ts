/**
 * The thread as it reads: AG-UI keeps a tool call on the assistant message
 * that made it and its answer on a tool message of its own; a reader sees one
 * assistant turn holding its words and its calls, each call with its answer.
 */
import type { Message } from '@ag-ui/client'

export interface CallView {
  id: string
  name: string
  args: Record<string, unknown>
  /** What the tool returned, or null while it has not answered. */
  result: string | null
}

export type TurnPart = { kind: 'text'; id: string; text: string } | { kind: 'call'; call: CallView }

export type Turn =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; parts: TurnPart[] }

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  return content === undefined ? '' : JSON.stringify(content)
}

function argsOf(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function turnsOf(messages: readonly Message[]): Turn[] {
  const results = new Map<string, string>()
  for (const message of messages) {
    if (message.role === 'tool') results.set(message.toolCallId, textOf(message.content))
  }
  const turns: Turn[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({ kind: 'user', id: message.id, text: textOf(message.content) })
      continue
    }
    if (message.role !== 'assistant') continue
    const parts: TurnPart[] = []
    if (message.content) parts.push({ kind: 'text', id: message.id, text: message.content })
    for (const call of message.toolCalls ?? []) {
      parts.push({
        kind: 'call',
        call: {
          id: call.id,
          name: call.function.name,
          args: argsOf(call.function.arguments),
          result: results.get(call.id) ?? null,
        },
      })
    }
    const last = turns.at(-1)
    if (last?.kind === 'assistant') last.parts.push(...parts)
    else if (parts.length > 0) turns.push({ kind: 'assistant', id: message.id, parts })
  }
  return turns
}
