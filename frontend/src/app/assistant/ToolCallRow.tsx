/**
 * A read the assistant made: one quiet line naming the tool, its subject and
 * env, and how it went; open it for the arguments and what came back.
 */
import { Wrench } from 'lucide-react'
import { Chip, type ChipTone } from '@/components/ui/chip'
import { EnvSignal } from '@/components/ui/env-signal'
import { FoldRow } from '@/components/ui/fold'
import type { CallView } from '@/features/assistant/thread-view'

function parsed(result: string): unknown {
  try {
    return JSON.parse(result) as unknown
  } catch {
    return undefined
  }
}

function stateOf(call: CallView, running: boolean): { word: string; tone: ChipTone } {
  if (call.result === null) {
    return running ? { word: 'Running', tone: 'info' } : { word: 'Stopped', tone: 'unknown' }
  }
  return parsed(call.result) === undefined
    ? { word: 'Failed', tone: 'bad' }
    : { word: 'Done', tone: 'neutral' }
}

function subjectOf(args: Record<string, unknown>): string | null {
  const subject = args.key ?? args.approval_id
  return typeof subject === 'string' ? subject : null
}

export function ToolCallRow({ call, running }: { call: CallView; running: boolean }) {
  const state = stateOf(call, running)
  const env = typeof call.args.env === 'string' && call.args.env !== 'all' ? call.args.env : null
  const subject = subjectOf(call.args)
  const value = call.result === null ? null : parsed(call.result)
  return (
    <FoldRow
      dense
      aria-label={`${call.name}${subject ? ` ${subject}` : ''}${env ? ` in ${env}` : ''}: ${state.word}`}
      className="rounded-md"
      summary={
        <span className="flex min-w-0 items-center gap-2 pr-2 text-xs">
          <Wrench aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-dim-foreground" />
          <span className="truncate font-mono text-muted-foreground">{call.name}</span>
          {subject && <span className="truncate font-mono text-foreground/85">{subject}</span>}
          {env && <EnvSignal env={env} size="sm" />}
          <Chip tone={state.tone} className="ml-auto shrink-0">
            {state.word}
          </Chip>
        </span>
      }
    >
      <div className="flex flex-col gap-2 py-2">
        <p className="field-label">Arguments</p>
        <pre className="overflow-x-auto font-mono text-nano text-muted-foreground">
          {JSON.stringify(call.args, null, 2)}
        </pre>
        <p className="field-label">Result</p>
        <pre className="max-h-56 overflow-auto font-mono text-nano break-words whitespace-pre-wrap text-muted-foreground">
          {call.result === null
            ? 'No answer yet.'
            : value === undefined
              ? call.result
              : JSON.stringify(value, null, 2)}
        </pre>
      </div>
    </FoldRow>
  )
}
