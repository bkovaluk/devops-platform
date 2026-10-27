/**
 * Investigations: what the DevOps agent made of each alarm, one tab per review
 * state, beside the finding open in the detail column.
 *
 * The tab, the window, the search and every facet live in the URL, so a link
 * is the queue somebody was looking at; the finding open is in the path,
 * `/investigations/<env>/<id>`. The list reads the env the shell names, or
 * every env the principal can read, newest first, and then each row says its
 * env. The facet counts are the window's and ignore the narrowing.
 */
import { getRouteApi, Link, Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { Check, ChevronDown, SearchX, Siren } from 'lucide-react'
import { type Ref, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { EnvSignal } from '@/components/ui/env-signal'
import { ErrorState } from '@/components/ui/error-state'
import { Hint } from '@/components/ui/hint'
import { Input } from '@/components/ui/input'
import { ListCard } from '@/components/ui/list-card'
import { Menu, MenuItem } from '@/components/ui/menu'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { StateMark } from '@/components/ui/state-mark'
import {
  type FacetKey,
  type FindingsParams,
  type FindingsSearch,
  isNarrowed,
  NO_FILTERS,
  paramsOf,
  QUERY_LIMIT,
  STATUSES,
  searchOf,
  windowFor,
  windowsFor,
} from '@/features/findings/findings-search'
import {
  STATUS_WORD,
  ageWord,
  isReported,
  outcomeWord,
  resolutionTone,
  resolutionWord,
  severityTone,
} from '@/features/findings/findings-words'
import { useFindings } from '@/features/findings/use-findings'
import { useTriageKeys } from '@/features/findings/use-triage-keys'
import { ALL_ENVS, envLabel } from '@/lib/env'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { cn, formatDate } from '@/lib/utils'
import { TRANSITION_PANE } from '@/lib/view-transition'
import type { FindingRow, FindingStatus, FindingWindow } from '@/types/api'
import { ViewHeader } from '../layout/ViewHeader'
import { FindingFacets } from './FindingFacets'
import { type Shortcut, ShortcutsPopover } from './ShortcutsPopover'

const route = getRouteApi('/investigations')

const SHORTCUTS: readonly Shortcut[] = [
  { keys: ['j', 'k'], word: 'Next or previous investigation' },
  { keys: ['/'], word: 'Search' },
  { keys: ['a'], word: 'Acknowledge the open one' },
  { keys: ['c'], word: 'Close the open one' },
  { keys: ['h'], word: 'Next hypothesis' },
  { keys: ['Esc'], word: 'Back to the list' },
  { keys: ['?'], word: 'These shortcuts' },
]

/** The search field. A question costs the API a window read, so it asks on
 *  Enter and never on a keystroke. */
function SearchField({
  query,
  inputRef,
  onSearch,
}: {
  query: string
  inputRef: Ref<HTMLInputElement>
  onSearch: (query: string) => void
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const [asked, setAsked] = useState(query)
  if (asked !== query) {
    setAsked(query)
    setTyped(null)
  }
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(typed ?? query)
      }}
    >
      <Input
        ref={inputRef}
        size="sm"
        type="search"
        aria-label="Search investigations"
        placeholder="Search title, alarm, resource or error, then Enter"
        maxLength={QUERY_LIMIT}
        value={typed ?? query}
        onChange={(event) => setTyped(event.target.value)}
      />
    </form>
  )
}

/** How far back the tab reads. */
function WindowMenu({
  status,
  value,
  onChange,
}: {
  status: FindingStatus
  value: FindingWindow
  onChange: (window: FindingWindow) => void
}) {
  return (
    <Menu
      align="end"
      className="min-w-24"
      trigger={
        <button
          type="button"
          aria-label={`Window: ${value}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-xs text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          {value}
          <ChevronDown aria-hidden="true" className="h-3 w-3" />
        </button>
      }
    >
      {windowsFor(status).map((each) => (
        <MenuItem key={each} checked={each === value} onSelect={() => onChange(each)}>
          <span className="flex-1 font-mono">{each}</span>
          {each === value && <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-signal" />}
        </MenuItem>
      ))}
    </Menu>
  )
}

/** What a row says about where a finding stands: its resolution once closed,
 *  otherwise its outcome when that is anything but a reported cause. */
function Standing({ row }: { row: FindingRow }) {
  if (row.status === 'closed') {
    return (
      <Chip tone={resolutionTone(row.resolution)} soft>
        {resolutionWord(row.resolution)}
      </Chip>
    )
  }
  if (isReported(row.outcome)) return null
  return (
    <Chip tone={row.outcome === 'incomplete' ? 'warn' : 'neutral'} soft>
      {outcomeWord(row.outcome)}
    </Chip>
  )
}

function FindingListRow({
  row,
  showEnv,
  listSearch,
}: {
  row: FindingRow
  showEnv: boolean
  /** The list's own keys, so opening a row keeps the list it was opened from. */
  listSearch: FindingsSearch & { env?: string }
}) {
  const params = useParams({ strict: false }) as { env?: string; findingId?: string }
  const selected = params.env === row.env && params.findingId === row.finding_id
  const title = row.title ?? row.alarm_name ?? row.finding_id
  const resource = row.resource_name ?? row.alarm_name
  const tone = severityTone(row.severity)
  return (
    <ListCard.Surface asChild interactive selected={selected} size="lg">
      <Link
        to="/investigations/$env/$findingId"
        params={{ env: row.env, findingId: row.finding_id }}
        search={listSearch}
        viewTransition
        className="grid-cols-[minmax(0,1fr)_auto] gap-y-1 py-2.5"
      >
        <span className="flex min-w-0 items-start gap-2">
          {tone !== 'unknown' && (
            <span className="flex h-5 shrink-0 items-center">
              <StateMark tone={tone} word={row.severity ?? undefined} mode="delegated" size="sm" />
              <span className="sr-only">{`${row.severity} severity. `}</span>
            </span>
          )}
          <span className="line-clamp-2 text-label leading-5 font-medium text-foreground">
            {title}
          </span>
        </span>
        <Hint label={formatDate(row.created_at)}>
          <time
            dateTime={row.created_at}
            className="self-start font-mono text-nano leading-5 tabular-nums text-dim-foreground"
          >
            {ageWord(row.created_at)}
          </time>
        </Hint>
        <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
          {showEnv && <EnvSignal env={row.env} size="sm" className="shrink-0" />}
          {row.resource_type && <span className="shrink-0">{row.resource_type}</span>}
          {resource && <span className="min-w-0 truncate text-dim-foreground">{resource}</span>}
        </span>
        <span className="justify-self-end">
          <Standing row={row} />
        </span>
      </Link>
    </ListCard.Surface>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex min-h-14 flex-col justify-center gap-1.5 px-4">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function InvestigationsView() {
  const search = route.useSearch()
  const navigate = useNavigate()
  const env = search.env ?? ALL_ENVS
  const params = paramsOf(search)
  const list = useFindings(env, params)
  const open = useParams({ strict: false }) as { env?: string; findingId?: string }
  const searchInput = useRef<HTMLInputElement>(null)
  const shortcuts = useRef<HTMLButtonElement>(null)
  const pages = list.data?.pages ?? []
  const first = pages[0]
  const rows = pages.flatMap((page) => page.items)
  const statusWord = STATUS_WORD[params.status].toLowerCase()

  /** Narrows the list, with the finding open, if one is, still open. */
  const go = (next: Partial<FindingsParams>) =>
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, ...searchOf({ ...params, ...next }) }),
      replace: true,
    })

  const toggleFacet = (key: FacetKey, value: string) => {
    const held = params.filters[key]
    go({
      filters: {
        ...params.filters,
        [key]: held.includes(value) ? held.filter((each) => each !== value) : [...held, value],
      },
    })
  }

  const openRow = (row: FindingRow) =>
    void navigate({
      to: '/investigations/$env/$findingId',
      params: { env: row.env, findingId: row.finding_id },
      search: (prev: Record<string, unknown>) => ({ ...prev, close: undefined }),
      viewTransition: true,
    })

  /** Opens the row `by` away from the open one; with nothing open, the first. */
  const openBy = (by: 1 | -1) => {
    if (rows.length === 0) return
    const here = rows.findIndex((row) => row.env === open.env && row.finding_id === open.findingId)
    const next = here < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, here + by))
    const row = rows[next]
    if (row && next !== here) openRow(row)
  }

  useTriageKeys({
    j: () => openBy(1),
    k: () => openBy(-1),
    '/': () => searchInput.current?.focus(),
    '?': () => shortcuts.current?.click(),
  })

  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label="Investigations"
        className="flex w-full shrink-0 flex-col border-r border-shell-separator bg-card md:w-96 lg:w-[440px]"
      >
        <ViewHeader
          gutter="list"
          title="Investigations"
          icon={Siren}
          accent={TOOL_ACCENTS.investigations.text}
          aside={first ? first.total : undefined}
          actions={<ShortcutsPopover shortcuts={SHORTCUTS} triggerRef={shortcuts} />}
        />
        <div className="flex flex-col gap-2 px-gutter-list pb-3">
          <div className="flex items-center gap-2">
            <SegmentedControl<FindingStatus>
              label="Review state"
              value={params.status}
              onValueChange={(status) =>
                go({
                  status,
                  window: windowFor(status, params.window),
                  // What only a closed finding has means nothing on the other tabs.
                  filters:
                    status === 'closed'
                      ? params.filters
                      : { ...params.filters, resolution: [], resolved_by: [] },
                })
              }
              options={STATUSES.map((status) => ({
                value: status,
                label: STATUS_WORD[status],
                count: status === params.status ? first?.total : undefined,
              }))}
            />
            <span className="ml-auto">
              <WindowMenu
                status={params.status}
                value={params.window}
                onChange={(window) => go({ window })}
              />
            </span>
          </div>
          <SearchField
            query={params.query}
            inputRef={searchInput}
            onSearch={(query) => go({ query })}
          />
          <FindingFacets
            facets={first?.facets ?? null}
            status={params.status}
            filters={params.filters}
            includeTriage={params.includeTriage}
            onToggle={toggleFacet}
            onClear={(key) => go({ filters: { ...params.filters, [key]: [] } })}
            onToggleTriage={() => go({ includeTriage: !params.includeTriage })}
            onClearAll={() => go({ filters: NO_FILTERS, query: '' })}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.error ? (
            <ErrorState
              noun="investigations"
              detail={list.error.message}
              onRetry={() => void list.refetch()}
            />
          ) : list.isPending ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            isNarrowed(params) ? (
              <EmptyState
                icon={<SearchX />}
                title="Nothing matches"
                body="Nothing in this window matches the search or the narrowing."
              />
            ) : (
              <EmptyState
                icon={<Siren />}
                title={`Nothing ${statusWord}`}
                body={`No investigations ${statusWord} in ${env === ALL_ENVS ? 'any env' : env} over the last ${params.window}.`}
              />
            )
          ) : (
            <>
              <ul aria-label="Investigations" className="flex flex-col">
                {rows.map((row) => (
                  <li key={`${row.env}/${row.finding_id}`}>
                    <FindingListRow
                      row={row}
                      showEnv={env === ALL_ENVS}
                      listSearch={{ env: search.env, ...searchOf(params) }}
                    />
                  </li>
                ))}
              </ul>
              {list.hasNextPage && (
                <div className="flex justify-center px-gutter-list py-3">
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={list.isFetchingNextPage}
                    hint={`${rows.length} of ${first?.total ?? rows.length} shown`}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <p className="flex shrink-0 items-center gap-2 border-t border-shell-separator px-gutter-list py-2 font-mono text-nano text-dim-foreground">
          <span>{envLabel(env)}</span>
          {first && <span>{`${rows.length} of ${first.total}`}</span>}
          {first?.truncated && (
            <Chip
              tone="warn"
              soft
              hint="An environment held more than one read takes, so the counts stop there. A shorter window counts all of it."
            >
              Partial
            </Chip>
          )}
        </p>
      </section>
      <div
        className={cn('hidden min-w-0 flex-1 flex-col overflow-y-auto md:flex', TRANSITION_PANE)}
      >
        <Outlet />
      </div>
    </div>
  )
}
