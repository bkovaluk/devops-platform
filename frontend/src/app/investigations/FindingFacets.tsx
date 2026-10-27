/**
 * The narrowing chips under the search: one per facet worth choosing in, each
 * a menu of the facet's values with how many the window holds.
 *
 * The counts are the window's (the tab, the window and whether triage rows
 * are in) and ignore every other narrowing, so a value keeps its number while
 * the list under a different filter shrinks. A facet with one value has
 * nothing to choose between and waits under More with the triage switch; a
 * facet holding a narrowing always has its chip, with its own way off.
 * Resolution and Reviewer only mean something once a finding is closed, so the
 * other tabs never offer them.
 */
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { FACET_KEYS, type FacetKey, type FindingFilters } from '@/features/findings/findings-search'
import { FACET_LABEL, TRIAGE_KINDS, facetWord } from '@/features/findings/findings-words'
import { cn } from '@/lib/utils'
import type { FindingFacets as Facets, FindingStatus } from '@/types/api'

const CHIP =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

const OFFERED = cn(
  CHIP,
  'border border-dashed border-input text-muted-foreground hover:bg-accent hover:text-foreground',
)

const QUIET = cn(CHIP, 'text-dim-foreground hover:bg-accent hover:text-foreground')

const CLOSED_ONLY: readonly FacetKey[] = ['resolution', 'resolved_by']

const MONO: readonly FacetKey[] = ['tool', 'model']

interface Line {
  value: string
  count: number | null
}

/** A facet's values, most first, then whatever is chosen that the counts
 *  never heard of: a narrowing that matched nothing is still one to take off. */
function linesOf(
  counts: Readonly<Record<string, number>> | undefined,
  chosen: readonly string[],
): Line[] {
  const counted = Object.entries(counts ?? {})
    .filter(([, count]) => count > 0)
    .sort(([a, left], [b, right]) => right - left || a.localeCompare(b))
    .map(([value, count]) => ({ value, count }))
  const known = new Set(counted.map((line) => line.value))
  return [
    ...counted,
    ...chosen.filter((value) => !known.has(value)).map((value) => ({ value, count: null })),
  ]
}

function FacetChip({
  facet,
  lines,
  chosen,
  onToggle,
  onClear,
}: {
  facet: FacetKey
  lines: readonly Line[]
  chosen: readonly string[]
  onToggle: (value: string) => void
  onClear: () => void
}) {
  const label = FACET_LABEL[facet]
  const held = chosen.map((value) => facetWord(facet, value)).join(', ')
  const applied = chosen.length > 0
  return (
    <span className={cn('inline-flex items-center', applied && 'rounded-md bg-accent')}>
      <Menu
        className="min-w-48"
        trigger={
          <button
            type="button"
            aria-label={applied ? `${label}: ${held}` : label}
            className={applied ? cn(CHIP, 'pr-1 text-foreground') : OFFERED}
          >
            {label}
            {applied && (
              <span className="max-w-40 truncate font-mono text-muted-foreground">{held}</span>
            )}
          </button>
        }
      >
        {lines.map((line) => (
          <MenuItem
            key={line.value}
            checked={chosen.includes(line.value)}
            onSelect={() => onToggle(line.value)}
          >
            <span className={cn('flex-1 truncate', MONO.includes(facet) && 'font-mono')}>
              {facetWord(facet, line.value)}
            </span>
            {line.count !== null && <span className="count">{line.count}</span>}
            {chosen.includes(line.value) && (
              <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-signal" />
            )}
          </MenuItem>
        ))}
      </Menu>
      {applied && (
        <IconButton
          label={`Clear ${label.toLowerCase()}`}
          size="icon-sm"
          icon={<X aria-hidden="true" className="h-3 w-3" />}
          onClick={onClear}
        />
      )}
    </span>
  )
}

interface FindingFacetsProps {
  facets: Facets | null
  status: FindingStatus
  filters: FindingFilters
  includeTriage: boolean
  onToggle: (key: FacetKey, value: string) => void
  onClear: (key: FacetKey) => void
  onToggleTriage: () => void
  onClearAll: () => void
}

export function FindingFacets({
  facets,
  status,
  filters,
  includeTriage,
  onToggle,
  onClear,
  onToggleTriage,
  onClearAll,
}: FindingFacetsProps) {
  const keys = FACET_KEYS.filter((key) => status === 'closed' || !CLOSED_ONLY.includes(key))
  const all = keys.map((key) => {
    const lines = linesOf(facets?.[key], filters[key])
    // Triage kinds are values of their own only once the rows are in; until
    // then More holds the one switch that lets them in.
    const shown =
      key === 'kind' && !includeTriage
        ? lines.filter((line) => !TRIAGE_KINDS.includes(line.value))
        : lines
    return { key, lines: shown }
  })
  const chipped = all.filter(({ key, lines }) => lines.length > 1 || filters[key].length > 0)
  const quiet = all.filter(({ key, lines }) => lines.length === 1 && filters[key].length === 0)
  const narrowings = keys.reduce((sum, key) => sum + filters[key].length, 0)

  return (
    <div role="group" aria-label="Narrow the list" className="flex flex-wrap items-center gap-1.5">
      {chipped.map(({ key, lines }) => (
        <FacetChip
          key={key}
          facet={key}
          lines={lines}
          chosen={filters[key]}
          onToggle={(value) => onToggle(key, value)}
          onClear={() => onClear(key)}
        />
      ))}
      <Menu
        className="min-w-56"
        trigger={
          <button type="button" className={QUIET}>
            More
          </button>
        }
      >
        {quiet.map(({ key, lines }) => {
          const line = lines[0]!
          return (
            <MenuItem key={key} checked={false} onSelect={() => onToggle(key, line.value)}>
              <span className="flex-1 truncate">
                {`${FACET_LABEL[key]} `}
                <span className={cn('text-muted-foreground', MONO.includes(key) && 'font-mono')}>
                  {facetWord(key, line.value)}
                </span>
              </span>
              <span className="count">{line.count}</span>
            </MenuItem>
          )
        })}
        {quiet.length > 0 && <MenuSeparator />}
        <MenuItem checked={includeTriage} onSelect={onToggleTriage}>
          <span className="flex-1">Triage rows</span>
          {includeTriage && <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-signal" />}
        </MenuItem>
      </Menu>
      {narrowings > 1 && (
        <Button variant="ghost" size="xs" hint="Take off every narrowing" onClick={onClearAll}>
          Clear all
        </Button>
      )}
    </div>
  )
}
