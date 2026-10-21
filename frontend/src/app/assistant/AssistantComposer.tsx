/**
 * Where the person writes. Enter sends and Shift+Enter breaks the line; while
 * an answer streams the send becomes Stop. A proposal waiting for its confirm
 * holds the composer: the thread moves on once it is answered.
 */
import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import { sendMessage, stopRun } from '@/features/assistant/assistant-runtime'
import { useAssistantStore, useAwaitingDecision } from '@/features/assistant/assistant-store'

export function AssistantComposer() {
  const fieldId = useId()
  const field = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState('')
  const running = useAssistantStore((state) => state.running)
  const awaiting = useAwaitingDecision()

  useEffect(() => {
    field.current?.focus()
  }, [])

  function send() {
    if (running || awaiting || !draft.trim()) return
    sendMessage(draft)
    setDraft('')
  }

  return (
    <form
      className="shrink-0 px-gutter-pane pt-2 pb-4"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        Message the assistant
      </label>
      <div className="flex items-end gap-2 rounded-lg bg-well p-2 focus-within:outline-2 focus-within:outline-signal">
        <textarea
          ref={field}
          id={fieldId}
          rows={2}
          value={draft}
          disabled={awaiting}
          placeholder={
            awaiting ? 'Confirm or cancel the change first' : 'Ask about flags or approvals…'
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            send()
          }}
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-5 text-foreground outline-none placeholder:text-dim-foreground disabled:cursor-not-allowed"
        />
        {running ? (
          <IconButton
            label="Stop"
            variant="soft"
            icon={<Square aria-hidden="true" className="h-3.5 w-3.5" />}
            onClick={stopRun}
          />
        ) : (
          <IconButton
            type="submit"
            mutates={false}
            label="Send"
            variant="soft"
            disabled={awaiting || !draft.trim()}
            icon={<ArrowUp aria-hidden="true" className="h-4 w-4" />}
          />
        )}
      </div>
    </form>
  )
}
