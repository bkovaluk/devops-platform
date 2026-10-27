/**
 * Closing a finding is telling the agent how it did.
 *
 * What a reviewer may say depends on whether the agent reported a cause: a
 * reported one can be confirmed, called a false positive or called wrong, and
 * anything else can only be dismissed. Each choice says what it means and what
 * the agent does with it, and the submit says the choice back. A refusal (the
 * finding was closed by someone else meanwhile) is said in place.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label, Textarea } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import {
  NOTE_LIMIT,
  RESOLUTION_MEANING,
  isReported,
  noteRequired,
  resolutionsFor,
} from '@/features/findings/findings-words'
import { useFindingActions } from '@/features/findings/use-finding-actions'
import { cn } from '@/lib/utils'
import type { FindingDetail, Resolution } from '@/types/api'

const FORM_ID = 'close-finding-form'

function submitLabel(resolution: Resolution): string {
  return resolution === 'dismissed' ? 'Dismiss' : `Close as ${RESOLUTION_MEANING[resolution].word}`
}

export function CloseFindingDialog({
  finding,
  open,
  initial,
  onOpenChange,
}: {
  finding: FindingDetail
  open: boolean
  /** The answer the dialog opens on. */
  initial: Resolution | undefined
  onOpenChange: (open: boolean) => void
}) {
  const options = resolutionsFor(finding.outcome)
  const reported = isReported(finding.outcome)
  const [picked, setPicked] = useState<Resolution | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const actions = useFindingActions()
  const resolution =
    picked ?? (initial && options.includes(initial) ? initial : (options[0] ?? 'dismissed'))
  const trimmed = note.trim()
  const missingNote = noteRequired(resolution) && trimmed === ''
  const meaning = RESOLUTION_MEANING[resolution]
  const resource = finding.resource_name ?? finding.alarm_name ?? 'this resource'

  const close = (next: boolean) => {
    if (!next) {
      setPicked(null)
      setNote('')
      setError(null)
    }
    onOpenChange(next)
  }

  const submit = async () => {
    setError(null)
    try {
      await actions.close(finding.env, finding.finding_id, {
        resolution,
        note: trimmed || null,
      })
      close(false)
    } catch (refused) {
      setError(refused instanceof Error ? refused.message : String(refused))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={reported ? 'Close investigation' : 'Dismiss investigation'}
      description={
        reported
          ? `How did the agent do? This teaches it what to trust the next time ${resource} alarms.`
          : 'This investigation reported no cause, so there is nothing for the agent to learn from it.'
      }
      actions={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={missingNote || actions.closing}
            hint={missingNote ? 'Say what was wrong first' : `Closes it in ${finding.env}`}
          >
            {actions.closing ? 'Closing…' : submitLabel(resolution)}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!missingNote && !actions.closing) void submit()
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-2">Resolution</legend>
          {options.map((option) => {
            const about = RESOLUTION_MEANING[option]
            const on = option === resolution
            return (
              <label
                key={option}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors duration-[var(--duration-fast)]',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-signal',
                  on ? 'bg-accent' : 'bg-well hover:bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="resolution"
                  value={option}
                  checked={on}
                  onChange={() => {
                    setPicked(option)
                    setError(null)
                  }}
                  className="mt-1 accent-[var(--signal)]"
                />
                <span className="flex min-w-0 flex-col gap-0.5 text-sm font-medium text-foreground">
                  {about.word}
                  <span className="text-xs font-normal text-muted-foreground">{about.meaning}</span>
                  <span
                    className={cn(
                      'font-mono text-nano font-normal',
                      about.remembered ? 'text-state-ok' : 'text-dim-foreground',
                    )}
                  >
                    {about.learning}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="finding-note">
              {noteRequired(resolution) ? 'Note (required)' : 'Note (optional)'}
            </Label>
            <span className="count">{`${note.length} / ${NOTE_LIMIT}`}</span>
          </div>
          <Textarea
            id="finding-note"
            rows={3}
            maxLength={NOTE_LIMIT}
            value={note}
            required={noteRequired(resolution)}
            onChange={(event) => {
              setNote(event.target.value)
              setError(null)
            }}
          />
        </div>

        {meaning.remembered && finding.likely_cause && (
          <Panel tone="well">
            <p className="text-xs text-muted-foreground">
              <span className="field-label mr-2">The agent will read</span>
              {`${meaning.word} past cause: ${finding.likely_cause}`}
            </p>
          </Panel>
        )}

        {error && (
          <p role="alert" className="text-xs text-state-bad">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
