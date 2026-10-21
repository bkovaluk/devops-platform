/**
 * One flag in one environment: its facts, its last hour of evaluations, its
 * raw record, and the danger zone. The edit sheet is URL state (`?edit=true`),
 * so "open this flag's editor" is a link.
 */
import { getRouteApi, Link } from '@tanstack/react-router'
import { Flag, FlagOff, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { EnvSignal } from '@/components/ui/env-signal'
import { ErrorState } from '@/components/ui/error-state'
import { Fold } from '@/components/ui/fold'
import { Hint } from '@/components/ui/hint'
import { Panel } from '@/components/ui/panel'
import { SECTION_GAP, SECTION_HEAD_GAP, SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StateMark } from '@/components/ui/state-mark'
import { inEnv } from '@/features/auth/permissions'
import { useScopes } from '@/features/auth/use-scopes'
import { useFlag } from '@/features/flags/use-flags'
import { APIError } from '@/lib/api-client'
import { buildResourceLink } from '@/lib/resource-links'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import type { Flag as FlagRecord } from '@/types/api'
import { DeleteFlagDialog } from './DeleteFlagDialog'
import { EvaluationStrip } from './EvaluationStrip'
import { FlagSheet } from './FlagSheet'
import { flagStateTone, flagStateWord } from './flag-words'

const route = getRouteApi('/flags/$env/$key')

export function FlagDetail() {
  const { env, key } = route.useParams()
  const { data: flag, isPending, error, refetch } = useFlag(key, env)

  if (isPending) return <DetailSkeleton />
  if (error instanceof APIError && error.status === 404) {
    return (
      <EmptyState
        variant="inspector"
        icon={<FlagOff />}
        title={`No ${key} in ${env}`}
        body="It may have been deleted, or it exists in another environment. Switch environments above to look there."
      />
    )
  }
  if (error) {
    return (
      <ErrorState
        variant="inspector"
        noun="this flag"
        detail={error.message}
        onRetry={() => void refetch()}
      />
    )
  }
  return <FlagBody flag={flag} />
}

function FlagBody({ flag }: { flag: FlagRecord }) {
  const { edit } = route.useSearch()
  const navigate = route.useNavigate()
  const { can } = useScopes()
  const [deleting, setDeleting] = useState(false)
  const writable = can(inEnv('flags', 'write', flag.env))
  const setEditing = (open: boolean) =>
    void navigate({ search: (prev) => ({ ...prev, edit: open || undefined }) })

  return (
    <article
      aria-labelledby="flag-heading"
      className={cn('@container flex flex-col px-gutter-pane pt-4 pb-10', SECTION_GAP)}
    >
      <header className="flex flex-wrap items-center gap-3">
        <Flag aria-hidden="true" className={cn('h-4 w-4 shrink-0', TOOL_ACCENTS.flags.text)} />
        <h1
          id="flag-heading"
          className="min-w-0 truncate font-mono text-heading font-medium text-foreground"
        >
          {flag.key}
        </h1>
        <EnvSignal env={flag.env} />
        <div className="ml-auto flex items-center gap-1.5">
          <CopyButton
            value={buildResourceLink({ kind: 'flag', key: flag.key, env: flag.env })}
            label="Copy link"
          />
          <Button
            variant="soft"
            size="sm"
            disabled={!writable}
            hint={
              writable ? `Change it in ${flag.env}` : `Editing needs flags:write in ${flag.env}`
            }
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </header>

      <Facts flag={flag} />

      <section aria-labelledby="evaluations-heading">
        <SectionHeader
          layout="page"
          id="evaluations-heading"
          title="Evaluations"
          description="The last 60 minutes, one column a minute. Press a minute for its reading."
          className={SECTION_HEAD_GAP}
        />
        <EvaluationStrip flag={flag} />
      </section>

      <Fold title="Raw record">
        <Panel tone="well" className="overflow-x-auto">
          <pre className="mono text-xs leading-5 text-muted-foreground">
            {JSON.stringify(flag, null, 2)}
          </pre>
        </Panel>
      </Fold>

      <section aria-labelledby="danger-heading">
        <SectionHeader
          layout="pane"
          danger
          id="danger-heading"
          title="Danger zone"
          className={SECTION_HEAD_GAP}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-xs text-muted-foreground">
            Deleting removes {flag.key} from {flag.env}. Code that reads it falls back to its
            default.
          </p>
          <Button
            variant="danger"
            size="sm"
            disabled={!writable}
            hint={writable ? undefined : `Deleting needs flags:write in ${flag.env}`}
            onClick={() => setDeleting(true)}
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            Delete flag
          </Button>
        </div>
      </section>

      <FlagSheet mode="edit" flag={flag} open={edit === true} onOpenChange={setEditing} />
      <DeleteFlagDialog flag={flag} open={deleting} onOpenChange={setDeleting} />
    </article>
  )
}

function Facts({ flag }: { flag: FlagRecord }) {
  return (
    <Panel tone="well" pad="lg">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 @lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="field-label">State</dt>
          <dd className="flex items-center gap-2 text-heading text-foreground">
            <StateMark tone={flagStateTone(flag)} word={flag.enabled ? 'On' : 'Off'} />
            {flagStateWord(flag)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="field-label">Rollout</dt>
          <dd className="font-mono text-sm tabular-nums text-foreground">
            {flag.rollout_percent}%
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="field-label">Owner</dt>
          <dd className="truncate text-sm text-foreground">{flag.owner || 'Nobody'}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="field-label">Updated</dt>
          <dd className="text-sm text-foreground">
            <Hint label={formatDate(flag.updated_at)}>
              <time dateTime={flag.updated_at}>{relativeTime(flag.updated_at)}</time>
            </Hint>
            <span className="sr-only"> ({formatDate(flag.updated_at)})</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="field-label">Updated by</dt>
          <dd className="truncate text-sm text-foreground">{flag.updated_by}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="field-label">Environment</dt>
          <dd>
            <Link
              to="/flags"
              search={{ env: flag.env }}
              viewTransition
              className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              <EnvSignal env={flag.env} />
            </Link>
          </dd>
        </div>
        <div className="col-span-full flex flex-col gap-1">
          <dt className="field-label">Description</dt>
          <dd className="text-sm text-foreground">{flag.description || 'No description'}</dd>
        </div>
      </dl>
    </Panel>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6 px-gutter-pane pt-4">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-14 w-full" />
    </div>
  )
}
