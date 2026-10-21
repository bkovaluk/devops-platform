/**
 * Home is assembled from contributions and names no tool: the quick actions,
 * the attention strip, the tool tiles and the activity feed are each a
 * fragment some tool lends, mounted only for tools the principal can open.
 * A principal with no workspace gets a page about getting one instead.
 */
import { Activity, Lock } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { SECTION_GAP, SECTION_HEAD_GAP, SectionHeader } from '@/components/ui/section-header'
import { CONTRACT } from '@/features/auth/permissions'
import { useScopes } from '@/features/auth/use-scopes'
import { useConfig } from '@/features/config/use-config'
import { activitySlot } from '@/features/tools/activity-slot'
import { ActivityRow } from '@/features/tools/home-parts'
import { contributorsOf, hasWorkspace, homeTilesFor } from '@/features/tools/tool-registry'
import { cn } from '@/lib/utils'

/** How many rows the merged feed shows. */
const FEED_ROWS = 10

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage() {
  const principal = useScopes()
  const { data: config } = useConfig()
  const [hour] = useState(() => new Date().getHours())

  if (!hasWorkspace(principal)) return <WaitingForAccess email={principal.email} />

  const firstName = principal.name?.split(' ')[0] ?? principal.email?.split('@')[0] ?? ''
  const environments = config?.environments ?? []
  const direct = config?.direct_envs ?? []

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn('mx-auto flex max-w-5xl flex-col px-gutter-page py-8', SECTION_GAP)}>
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-foreground">
              {greeting(hour)}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {environments.length} environments. Changes apply directly in{' '}
              {direct.join(', ') || 'none'}; everywhere else they wait for a second person.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {contributorsOf(principal, 'quickAction').map(({ id, contributions }) => (
              <contributions.quickAction key={id} />
            ))}
          </div>
        </header>

        <section
          aria-label="Needs attention"
          className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1"
        >
          {contributorsOf(principal, 'attention').map(({ id, contributions }) => (
            <contributions.attention key={id} />
          ))}
        </section>

        <section aria-labelledby="home-tools">
          <SectionHeader
            layout="page"
            id="home-tools"
            title="Tools"
            description="Everything your roles open."
            className={SECTION_HEAD_GAP}
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {homeTilesFor(principal).map(({ id, homeTile }) => {
              const Tile = homeTile?.component
              return Tile ? <Tile key={id} /> : null
            })}
          </div>
        </section>

        <section aria-labelledby="home-activity">
          <SectionHeader
            layout="page"
            id="home-activity"
            title="Activity"
            description="The latest changes and requests, across every environment."
            aside="newest first"
            className={SECTION_HEAD_GAP}
          />
          <activitySlot.Collector>
            {(events) => {
              const newest = [...events]
                .sort((a, b) => b.at.localeCompare(a.at))
                .slice(0, FEED_ROWS)
              return (
                <>
                  {contributorsOf(principal, 'activity').map(({ id, contributions }) => (
                    <contributions.activity key={id} />
                  ))}
                  {newest.length === 0 ? (
                    <EmptyState
                      variant="inline"
                      icon={<Activity />}
                      title="Nothing has happened yet."
                    />
                  ) : (
                    <ul className="-mx-3 flex flex-col">
                      {newest.map((event) => (
                        <li key={event.key}>
                          <ActivityRow event={event} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )
            }}
          </activitySlot.Collector>
        </section>
      </div>
    </div>
  )
}

/** A principal with no grants gets a page, not an empty app: who they are,
 *  and the roles there are to ask for. */
function WaitingForAccess({ email }: { email: string | null }) {
  const roles = Object.entries(CONTRACT.roles)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <EmptyState
        icon={<Lock />}
        title="No tools are open to you yet"
        body={
          <>
            <p>
              Signed in as <span className="mono text-foreground">{email}</span>. Ask an admin for
              one of these roles:
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-left">
              {roles.map(([role, scopes]) => (
                <li key={role} className="flex items-baseline gap-2">
                  <span className="mono text-foreground">{role}</span>
                  <span className="font-mono text-nano text-dim-foreground">
                    {scopes.join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </>
        }
      />
    </div>
  )
}
