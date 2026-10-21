import { Eye } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { useViewAsStore } from '@/features/auth/view-as'

/** Start looking through someone else's grants. Read-only while it lasts. */
export function ViewAsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [email, setEmail] = useState('')
  const valid = /^[^@\s]+@[^@\s]+$/.test(email.trim())
  const start = () => {
    if (!valid) return
    useViewAsStore.getState().setViewAs(email.trim())
    onOpenChange(false)
    setEmail('')
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="View as someone else"
      description="Every surface answers with their grants. Nothing can be changed while you look."
      actions={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="view-as-form"
            mutates={false}
            disabled={!valid}
            hint={valid ? undefined : 'Enter an email address'}
          >
            <Eye aria-hidden="true" className="h-4 w-4" />
            View as
          </Button>
        </>
      }
    >
      <form
        id="view-as-form"
        onSubmit={(event) => {
          event.preventDefault()
          start()
        }}
      >
        <Field label="Email" htmlFor="view-as-email">
          <Input
            id="view-as-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="grace@example.com"
          />
        </Field>
      </form>
    </Dialog>
  )
}
