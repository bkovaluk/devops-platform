/**
 * The environment pick, and what the open tool makes of it.
 *
 * The pick lives in the URL and nowhere else: the shell's `env` search param,
 * or the env a single item's path names (`/flags/staging/checkout-v2`). Only
 * the person changes it, from the breadcrumb or with ⌥ and a digit; nothing
 * switches it on their behalf. Each tool declares in the registry whether the
 * pick steers it (`ToolEnvKind`). A pick the open tool cannot show, and an
 * env the principal cannot read there, stays in the menu, greyed with the
 * reason, and is never hidden.
 */
import { useMatches, useNavigate } from '@tanstack/react-router'
import { type Grants, inEnv } from '@/features/auth/permissions'
import { useScopes } from '@/features/auth/use-scopes'
import { useEnvironments } from '@/features/config/use-config'
import type { ToolDefinition, ToolEnvKind } from '@/features/tools/tool-registry'
import { ALL_ENVS } from '@/lib/env'
import { withViewTransition } from '@/lib/view-transition'
import { useFocusedEnv } from './use-focused-env'

/** Every env together, or one of the deployment's. */
export type EnvPick = string

/** The picks in the breadcrumb's order: every env, then the deployment's own. */
export function picksOf(environments: readonly string[]): readonly EnvPick[] {
  return [ALL_ENVS, ...environments]
}

/** The pick ⌥ and a digit asks for, by the physical key: Option changes the
 *  character a digit types on a Mac, never the key. ⌥0 is every env. */
export function pickForKey(code: string, picks: readonly EnvPick[]): EnvPick | null {
  const digit = /^Digit([0-9])$/.exec(code)?.[1]
  return digit === undefined ? null : (picks[Number(digit)] ?? null)
}

/** Why *tool* cannot be pointed at *pick*, in one line, or null where it can. */
export function pickRefusal(tool: ToolDefinition, pick: EnvPick, grants: Grants): string | null {
  if (tool.env === 'none') return `${tool.label} isn't tied to an env`
  if (pick === ALL_ENVS || tool.access.kind !== 'scoped') return null
  return grants.can(inEnv(tool.access.tool, 'read', pick))
    ? null
    : `You can't read ${tool.label.toLowerCase()} in ${pick}`
}

export interface EnvScope {
  kind: ToolEnvKind
  /** The pick the URL names, whatever the tool makes of it. */
  pick: EnvPick
  /** The env the tool is showing: the pick where the tool can show it, null
   *  for a tool tied to no env and for a pick the tool cannot show. */
  shown: EnvPick | null
  /** Why each pick is greyed while this tool is open, or null where it is not. */
  refusalOf: (pick: EnvPick) => string | null
}

export function useEnvScope(tool: ToolDefinition): EnvScope {
  const { env: pick } = useFocusedEnv()
  const grants = useScopes()
  const refusalOf = (each: EnvPick) => pickRefusal(tool, each, grants)
  const shown = tool.env === 'none' || refusalOf(pick) !== null ? null : pick
  return { kind: tool.env, pick, shown, refusalOf }
}

/**
 * Point the open tool at a pick. The pick it already has is left alone. On a
 * list the pick is the shell's `env`; on an item's page another env opens the
 * same item there when every env holds one of that name, and otherwise
 * returns to the tool's list in the env picked, with the list's own keys.
 */
export function useChoosePick(tool: ToolDefinition): (pick: EnvPick) => void {
  const navigate = useNavigate()
  const { env: current, pinned } = useFocusedEnv()
  const list = useMatches({
    select: (matches) => matches.find((match) => match.routeId === tool.path)?.search,
  }) as Record<string, unknown> | undefined
  return (pick) => {
    if (pick === current || tool.env === 'none') return
    const env = pick === ALL_ENVS ? undefined : pick
    withViewTransition(() => {
      if (pinned && tool.itemInEveryEnv && env) {
        void navigate({
          to: '.',
          params: (prev: Record<string, string>) => ({ ...prev, env }),
        })
        return
      }
      if (pinned) {
        void navigate({ to: tool.path, search: { ...list, env } })
        return
      }
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, env }),
      })
    })
  }
}

/** The deployment's picks, every env first. */
export function usePicks(): readonly EnvPick[] {
  return picksOf(useEnvironments())
}
