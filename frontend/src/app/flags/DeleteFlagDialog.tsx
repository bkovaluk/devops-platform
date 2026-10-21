/**
 * The confirm before a delete, which is approval-aware like every write: a
 * rose "Delete from dev" where it applies directly, an amber "Request approval
 * for prod" where it becomes a request.
 */
import { getRouteApi } from '@tanstack/react-router'
import { GitPullRequest, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useFlagActions } from '@/features/flags/use-flag-actions'
import type { Flag } from '@/types/api'

const route = getRouteApi('/flags/$env/$key')

export function DeleteFlagDialog({
  flag,
  open,
  onOpenChange,
}: {
  flag: Flag
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const actions = useFlagActions()
  const navigate = route.useNavigate()
  const routed = actions.needsApproval(flag.env)

  const confirm = async () => {
    const result = await actions.remove(flag.key, flag.env).catch(() => null)
    if (!result) return
    onOpenChange(false)
    if (result.applied) {
      void navigate({ to: '/flags', search: (prev) => ({ env: prev.env }), viewTransition: true })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${flag.key} from ${flag.env}?`}
      description="Code that reads this flag falls back to its default value."
      actions={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={routed ? 'glass-amber' : 'glass-rose'}
            disabled={actions.isPending}
            onClick={() => void confirm()}
          >
            {routed ? (
              <GitPullRequest aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            )}
            {routed ? `Request approval for ${flag.env}` : `Delete from ${flag.env}`}
          </Button>
        </>
      }
    >
      {routed && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-md bg-state-warn-fill px-3 py-2 text-xs text-state-warn"
        >
          <GitPullRequest aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>The flag stays in {flag.env} until a teammate approves the deletion.</p>
        </div>
      )}
    </Dialog>
  )
}
