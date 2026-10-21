/**
 * Feature flags: the list column on the card tone, and the detail column
 * beside it on the panel tone, split by the one structural seam. The list's
 * scope (env, search, state) lives in the URL, so a filtered list is a link.
 */
import { getRouteApi, Link, Outlet, useParams } from '@tanstack/react-router'
import { Flag, Plus, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { EnvSignal } from '@/components/ui/env-signal'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { ListCard } from '@/components/ui/list-card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { inAnyEnv } from '@/features/auth/permissions'
import { useScopes } from '@/features/auth/use-scopes'
import type { FlagState } from '@/features/flags/flag-search'
import { useFlags } from '@/features/flags/use-flags'
import { ALL_ENVS, envLabel } from '@/lib/env'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { cn } from '@/lib/utils'
import { TRANSITION_PANE } from '@/lib/view-transition'
import type { Flag as FlagRecord } from '@/types/api'
import { ViewHeader } from '../layout/ViewHeader'
import { FlagSheet } from './FlagSheet'
import { flagChipTone, flagStateWord } from './flag-words'

const route = getRouteApi('/flags')

type StateFilter = FlagState | 'any'

function matchesState(flag: FlagRecord, state: FlagState | undefined): boolean {
  if (!state) return true
  return state === 'on' ? flag.enabled : !flag.enabled
}

export function FlagsView() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { canAny } = useScopes()
  const env = search.env ?? ALL_ENVS
  const q = search.q ?? ''
  const { data, isPending, error, refetch } = useFlags({ env, q })
  const shown = data?.filter((flag) => matchesState(flag, search.state)) ?? []
  const writable = canAny(inAnyEnv('flags', 'write'))

  const setSearch = (patch: { q?: string; state?: FlagState; create?: boolean }) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label="Flags"
        className="flex w-full shrink-0 flex-col border-r border-shell-separator bg-card md:w-80 lg:w-[400px]"
      >
        <ViewHeader
          gutter="list"
          title="Feature flags"
          icon={Flag}
          accent={TOOL_ACCENTS.flags.text}
          aside={data ? shown.length : undefined}
          actions={
            writable && (
              <Button
                variant="soft"
                size="sm"
                hint="Create a flag in one environment"
                onClick={() => setSearch({ create: true })}
              >
                <Plus aria-hidden="true" className={`h-3.5 w-3.5 ${TOOL_ACCENTS.flags.text}`} />
                New flag
              </Button>
            )
          }
        />
        <div className="flex flex-col gap-2 px-gutter-list pb-3">
          <Input
            size="sm"
            type="search"
            aria-label="Search flags"
            placeholder="Search key, description or owner"
            value={q}
            onChange={(event) => setSearch({ q: event.target.value || undefined })}
          />
          <SegmentedControl<StateFilter>
            label="Flag state"
            value={search.state ?? 'any'}
            onValueChange={(value) => setSearch({ state: value === 'any' ? undefined : value })}
            options={[
              { value: 'any', label: 'All', count: data?.length },
              { value: 'on', label: 'On', count: data?.filter((flag) => flag.enabled).length },
              { value: 'off', label: 'Off', count: data?.filter((flag) => !flag.enabled).length },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <ErrorState noun="flags" detail={error.message} onRetry={() => void refetch()} />
          ) : isPending ? (
            <ListSkeleton />
          ) : shown.length === 0 ? (
            <EmptyList
              filtered={Boolean(q || search.state)}
              writable={writable}
              onNew={() => setSearch({ create: true })}
            />
          ) : (
            <ul aria-label="Flags" className="flex flex-col">
              {shown.map((flag) => (
                <li key={`${flag.env}/${flag.key}`}>
                  <FlagRow flag={flag} showEnv={env === ALL_ENVS} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="shrink-0 border-t border-shell-separator px-gutter-list py-2 font-mono text-nano text-dim-foreground">
          {env === ALL_ENVS ? 'All envs · read-only' : envLabel(env)}
          {data && ` · ${shown.length} of ${data.length}`}
        </p>
      </section>
      <div
        className={cn('hidden min-w-0 flex-1 flex-col overflow-y-auto md:flex', TRANSITION_PANE)}
      >
        <Outlet />
      </div>
      <FlagSheet
        mode="create"
        open={search.create === true}
        defaultEnv={env}
        onOpenChange={(open) => !open && setSearch({ create: undefined })}
      />
    </div>
  )
}

function FlagRow({ flag, showEnv }: { flag: FlagRecord; showEnv: boolean }) {
  const params = useParams({ strict: false }) as { env?: string; key?: string }
  const selected = params.env === flag.env && params.key === flag.key
  return (
    <ListCard.Surface asChild interactive selected={selected} size="lg">
      <Link
        to="/flags/$env/$key"
        params={{ env: flag.env, key: flag.key }}
        search={(prev) => ({ env: prev.env, q: prev.q, state: prev.state })}
        viewTransition
        className="grid-cols-[minmax(0,1fr)_auto] py-2"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="mono truncate text-foreground">{flag.key}</span>
            {showEnv && <EnvSignal env={flag.env} size="sm" className="shrink-0" />}
          </span>
          <span className="truncate text-xs text-dim-foreground">
            {flag.description || 'No description'}
          </span>
        </span>
        <Chip tone={flagChipTone(flag)} soft mono>
          {flagStateWord(flag)}
        </Chip>
      </Link>
    </ListCard.Surface>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex min-h-14 items-center justify-between gap-3 px-4">
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-56" />
          </span>
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function EmptyList({
  filtered,
  writable,
  onNew,
}: {
  filtered: boolean
  writable: boolean
  onNew: () => void
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="No flags match"
        body="Nothing in this scope matches the search or the state filter."
      />
    )
  }
  return (
    <EmptyState
      icon={<Flag />}
      title="No flags here yet"
      body="A flag turns behaviour on per environment and rolls it out by percent."
      cta={
        writable && (
          <Button variant="soft" size="sm" onClick={onNew}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            New flag
          </Button>
        )
      }
    />
  )
}
