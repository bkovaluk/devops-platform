/**
 * What Feature flags lends to the shared surfaces. Every reading here is of
 * flags and nothing else: a contribution never reads another tool's data.
 */
import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { Flag, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EnvSignal } from '@/components/ui/env-signal'
import { inAnyEnv } from '@/features/auth/permissions'
import { useScopes } from '@/features/auth/use-scopes'
import { useFlags } from '@/features/flags/use-flags'
import { ALL_ENVS } from '@/lib/env'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import { cn } from '@/lib/utils'
import { activitySlot } from '../activity-slot'
import { AttentionTile, HomeToolTile } from '../home-parts'
import {
  PALETTE_GROUP_LIMIT,
  PALETTE_ROW_CLASS,
  type PaletteContributionProps,
  PaletteGroup,
  SelectionMark,
} from '../palette-parts'

/** How many of the most recently changed flags reach the feed. */
const FEED_DEPTH = 8

export function FlagsHomeTile() {
  const { data } = useFlags({ env: ALL_ENVS })
  const enabled = data?.filter((flag) => flag.enabled).length
  return (
    <HomeToolTile
      to="/flags"
      label="Feature flags"
      icon={Flag}
      accent={TOOL_ACCENTS.flags.text}
      description="Turn behaviour on by environment and roll it out by percent."
      reading={data ? `${data.length} flags · ${enabled} on` : 'Loading'}
    />
  )
}

export function FlagsQuickAction() {
  const navigate = useNavigate()
  const { canAny } = useScopes()
  if (!canAny(inAnyEnv('flags', 'write'))) return null
  return (
    <Button
      variant="soft"
      size="sm"
      onClick={() => void navigate({ to: '/flags', search: { create: true } })}
    >
      <Plus aria-hidden="true" className={cn('h-3.5 w-3.5', TOOL_ACCENTS.flags.text)} />
      New flag
    </Button>
  )
}

export function FlagsAttention() {
  const { data } = useFlags({ env: ALL_ENVS })
  const partial = data?.filter((flag) => flag.enabled && flag.rollout_percent < 100).length
  return (
    <AttentionTile
      eyebrow="Rollouts"
      to="/flags"
      line={data ? `${partial} partial` : 'Loading'}
      qualifier="enabled below 100%"
    />
  )
}

export function FlagsActivity() {
  const { data = [] } = useFlags({ env: ALL_ENVS })
  const events = [...data]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, FEED_DEPTH)
    .map((flag) => ({
      key: `flag-${flag.env}-${flag.key}-${flag.updated_at}`,
      icon: Flag,
      tint: TOOL_ACCENTS.flags.text,
      noun: 'Flag',
      resource: flag.key,
      env: flag.env,
      actor: flag.updated_by,
      detail: flag.enabled ? `set it on at ${flag.rollout_percent}%` : 'set it off',
      at: flag.updated_at,
      link: { kind: 'flag' as const, key: flag.key, env: flag.env },
    }))
  activitySlot.useContribute('flags', events)
  return null
}

export function FlagsPalette({ query, onSelected }: PaletteContributionProps) {
  const navigate = useNavigate()
  const { data = [] } = useFlags({ env: ALL_ENVS, q: query.trim() })
  if (!query.trim() || data.length === 0) return null
  const shown = data.slice(0, PALETTE_GROUP_LIMIT)
  return (
    <PaletteGroup heading="Flags" count={data.length}>
      {shown.map((flag) => (
        <Command.Item
          key={`${flag.env}/${flag.key}`}
          value={`flag ${flag.key} ${flag.env} ${flag.description}`}
          onSelect={() => {
            void navigate({ to: '/flags/$env/$key', params: { env: flag.env, key: flag.key } })
            onSelected()
          }}
          className={PALETTE_ROW_CLASS}
        >
          <SelectionMark />
          <Flag aria-hidden="true" className={cn('h-4 w-4 shrink-0', TOOL_ACCENTS.flags.text)} />
          <span className="mono min-w-0 flex-1 truncate text-foreground">{flag.key}</span>
          <EnvSignal env={flag.env} size="sm" />
        </Command.Item>
      ))}
    </PaletteGroup>
  )
}
