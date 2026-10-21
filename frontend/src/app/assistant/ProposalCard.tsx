/**
 * A change the assistant wants to make, shown before it happens: what, where
 * and the field-by-field diff, drawn by the approvals resource registry. The
 * person confirms or cancels it. In an approval-routed env the confirm is the
 * amber "Request approval for {env}" with the callout that says a teammate
 * decides it; afterwards the card says what became of it and links there.
 */
import { GitPullRequest, Save, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { resourceConfig } from '@/components/approvals/resource-registry'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EnvSignal } from '@/components/ui/env-signal'
import { Panel } from '@/components/ui/panel'
import { ResourceAnchor } from '@/components/ui/resource-anchor'
import { answerProposal } from '@/features/assistant/assistant-runtime'
import { useAssistantStore } from '@/features/assistant/assistant-store'
import { asApproval, outcomeOf, type Proposal } from '@/features/assistant/proposal'
import { useNeedsApproval } from '@/features/auth/use-needs-approval'
import type { ResourceLink } from '@/lib/resource-links'

const LINK =
  'rounded-sm text-xs text-signal hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

function OutcomeLine({ proposal, result }: { proposal: Proposal; result: string | null }) {
  const { change } = proposal
  if (proposal.decision === 'cancelled') return <Chip>Cancelled</Chip>
  if (result === null) return <Chip tone="info">Sending</Chip>
  const outcome = outcomeOf(result)
  if (outcome.kind === 'refused') {
    return (
      <div className="flex min-w-0 items-start gap-2">
        <Chip tone="bad" soft className="shrink-0">
          Refused
        </Chip>
        <p className="min-w-0 text-xs break-words text-muted-foreground">{outcome.reason}</p>
      </div>
    )
  }
  const config = resourceConfig(change.tool)
  const requested = outcome.kind === 'requested'
  const link: ResourceLink | null = requested
    ? { kind: 'approval', id: outcome.approval.id }
    : config.link(asApproval(change, 'approved'))
  return (
    <div className="flex items-center gap-2">
      <Chip tone={requested ? 'warn' : 'ok'} soft>
        {requested ? 'Requested' : 'Applied'}
      </Chip>
      {link && (
        <ResourceAnchor resource={link} className={LINK}>
          {requested ? 'Open request' : `Open ${config.noun}`}
        </ResourceAnchor>
      )}
    </div>
  )
}

export function ProposalCard({ proposal, result }: { proposal: Proposal; result: string | null }) {
  const headingId = useId()
  const { change } = proposal
  const running = useAssistantStore((state) => state.running)
  const routed = useNeedsApproval(change.env)
  const config = resourceConfig(change.tool)
  const Icon = config.icon
  const destroys = change.verb === 'delete'
  const pending = proposal.decision === 'pending'

  return (
    <Panel tone="framed" pad="none" asChild>
      <section aria-labelledby={headingId} className="flex w-full flex-col">
        <div className="flex min-w-0 items-center gap-2 px-3 pt-3">
          <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${config.tint}`} />
          <h3 id={headingId} className="flex min-w-0 items-baseline gap-2 text-label">
            <span className="shrink-0 font-medium text-foreground">
              {config.actionLabel(change.verb)}
            </span>
            <span className="truncate font-mono text-foreground/85">{change.target}</span>
          </h3>
          <EnvSignal env={change.env} className="ml-auto" />
        </div>
        <div className="px-3 py-3">{config.renderDiff(asApproval(change, 'pending'))}</div>
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          {pending ? (
            <>
              {routed && (
                <div
                  role="note"
                  className="flex items-start gap-2 rounded-md bg-state-warn-fill px-3 py-2 text-xs text-state-warn"
                >
                  <GitPullRequest aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    This becomes a request for {change.env}. A teammate reviews it in Approvals, and
                    nothing changes in {change.env} until they approve it.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={running}
                  onClick={() => answerProposal(proposal.interruptId, 'cancelled')}
                >
                  Cancel
                </Button>
                <Button
                  mutates
                  size="sm"
                  variant={routed ? 'glass-amber' : destroys ? 'glass-rose' : 'default'}
                  disabled={running}
                  onClick={() => answerProposal(proposal.interruptId, 'confirmed')}
                >
                  {routed ? (
                    <GitPullRequest aria-hidden="true" className="h-3.5 w-3.5" />
                  ) : destroys ? (
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  ) : (
                    <Save aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {routed
                    ? `Request approval for ${change.env}`
                    : destroys
                      ? `Delete from ${change.env}`
                      : `Save to ${change.env}`}
                </Button>
              </div>
            </>
          ) : (
            <OutcomeLine proposal={proposal} result={result} />
          )}
        </div>
      </section>
    </Panel>
  )
}
