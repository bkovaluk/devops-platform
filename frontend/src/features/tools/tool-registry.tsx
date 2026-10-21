/* eslint-disable react-refresh/only-export-components --
 * The definitions and the lookups ship from one module so every entry point
 * consults the same list. Editing it costs a full reload, not a refresh. */

/**
 * Tool registry — the single declaration of what a tool is and where it shows
 * up. One entry carries its view, rail placement, digit order, title, deep-link
 * root, Home tile, palette commands, the scope that opens it, and every
 * fragment it lends to a shared surface. The rail, the digit shortcuts, Home,
 * the command palette and the router's gate all derive from this map, so a
 * principal's shell *is* the registry filtered by their grants.
 *
 * Keep entries declarative. Data fetching belongs in the tool's contribution
 * components (`./contributions`), which the shared surfaces mount only for
 * tools the principal can open; role names belong nowhere — gate on a scope.
 */
import type { useNavigate } from '@tanstack/react-router'
import { Flag, GitPullRequest, LayoutDashboard, Plus } from 'lucide-react'
import { type ComponentType, type ElementType, lazy } from 'react'
import { type Grants, inAnyEnv, type Scope, type Tool } from '@/features/auth/permissions'
import { TOOL_ACCENTS } from '@/lib/theme-constants'
import {
  ApprovalsActivity,
  ApprovalsAttention,
  ApprovalsCount,
  ApprovalsQuickAction,
  FlagsActivity,
  FlagsAttention,
  FlagsHomeTile,
  FlagsPalette,
  FlagsQuickAction,
  type PaletteContributionProps,
} from './contributions'

export type ToolId = 'home' | 'approvals' | 'flags'

/** Where a tool sits in the rail. `inbox` is the queue that spans every tool,
 *  right under Home; `hidden` tools are reachable by link and palette only. */
export type ToolGroup = 'shell' | 'inbox' | 'tools' | 'hidden'

/** The route a tool's rail row, Home tile and palette entry open. */
export type ToolPath = '/' | '/approvals' | '/flags'

/**
 * What it takes to open a tool. `scoped` names the API tool and `entry`, the
 * scopes that reach the first read it makes on opening — read from the
 * contract's admission table, never typed by hand. A principal who holds none
 * would land on a 403, so the tool stays out of their shell. `public` is what
 * every signed-in principal has.
 */
export type ToolAccess =
  | { kind: 'scoped'; tool: Tool; entry: readonly Scope[] }
  | { kind: 'public' }

export type Navigate = ReturnType<typeof useNavigate>

export interface ToolCommand {
  /** cmdk match value — unique across the palette. */
  id: string
  label: string
  hint: string
  icon: ElementType
  iconClassName?: string
  run: (navigate: Navigate) => void
}

/**
 * Anything a tool keeps outside the query cache — a store, a timer — with the
 * grants that paid for it, so a revocation can end it.
 */
export interface ToolTeardown {
  grantedBy: readonly Tool[]
  run: () => void
}

/**
 * The fragments a tool lends to surfaces it does not own. Each is a component,
 * never a hook the surface calls: the surface mounts it only for a principal
 * who can open the tool, and mounting is what starts the query.
 */
export interface ToolContributions {
  /** A live reading beside the tool's rail row. */
  count?: ComponentType
  /** One of Home's quick-action buttons. */
  quickAction?: ComponentType
  /** One cell of Home's attention strip. */
  attention?: ComponentType
  /** Rows for Home's merged activity feed. Renders nothing itself. */
  activity?: ComponentType
  /** A results group in the command palette. */
  palette?: ComponentType<PaletteContributionProps>
  teardown?: ToolTeardown
}

export interface ToolDefinition {
  id: ToolId
  label: string
  icon: ElementType
  /** The tool's identity colour, on its icon and nowhere else. */
  accent: string
  group: ToolGroup
  /** The route that opens the tool; its deep links live under it
   *  (`lib/resource-links.ts`). */
  path: ToolPath
  /** The tool's root view. The router mounts it behind `ToolBoundary`. */
  view: ComponentType
  access: ToolAccess
  /** Document-title segment: "<title> | <app name>". Home has none. */
  title?: string
  homeTile?: { rank: number; component: ComponentType }
  paletteCommands?: readonly ToolCommand[]
  contributions?: ToolContributions
  /** Digit-shortcut and rail order. */
  shortcutRank: number
}

// Lazy throughout: the shell mounts only the open tool, and a dynamic import
// keeps the registry free of edges back into the views that read it.
const HomePage = lazy(() => import('@/app/layout/HomePage').then((m) => ({ default: m.HomePage })))
const ApprovalsView = lazy(() =>
  import('@/app/approvals/ApprovalsView').then((m) => ({ default: m.ApprovalsView })),
)
const FlagsView = lazy(() =>
  import('@/app/flags/FlagsView').then((m) => ({ default: m.FlagsView })),
)

/** Keyed by id so the type system insists every tool is declared exactly once. */
export const TOOL_REGISTRY: Readonly<Record<ToolId, ToolDefinition>> = {
  home: {
    id: 'home',
    label: 'Home',
    icon: LayoutDashboard,
    accent: TOOL_ACCENTS.brand.text,
    group: 'shell',
    path: '/',
    view: HomePage,
    access: { kind: 'public' },
    shortcutRank: 0,
  },
  approvals: {
    id: 'approvals',
    label: 'Approvals',
    icon: GitPullRequest,
    accent: TOOL_ACCENTS.approvals.text,
    group: 'inbox',
    path: '/approvals',
    view: ApprovalsView,
    // The inbox lists the requests of every tool the principal can read, in the
    // envs they can read it; reviewing is a separate grant, asked per row.
    access: { kind: 'scoped', tool: 'approvals', entry: inAnyEnv('flags', 'read') },
    title: 'Approvals',
    shortcutRank: 1,
    contributions: {
      count: ApprovalsCount,
      quickAction: ApprovalsQuickAction,
      attention: ApprovalsAttention,
      activity: ApprovalsActivity,
    },
  },
  flags: {
    id: 'flags',
    label: 'Feature flags',
    icon: Flag,
    accent: TOOL_ACCENTS.flags.text,
    group: 'tools',
    path: '/flags',
    view: FlagsView,
    access: { kind: 'scoped', tool: 'flags', entry: inAnyEnv('flags', 'read') },
    title: 'Flags',
    shortcutRank: 2,
    homeTile: { rank: 0, component: FlagsHomeTile },
    contributions: {
      quickAction: FlagsQuickAction,
      attention: FlagsAttention,
      activity: FlagsActivity,
      palette: FlagsPalette,
    },
    paletteCommands: [
      {
        id: 'create-flag',
        label: 'New flag',
        hint: 'Create a feature flag',
        icon: Plus,
        iconClassName: TOOL_ACCENTS.flags.text,
        run: (navigate) =>
          navigate({ to: '/flags', search: (prev) => ({ ...prev, create: true }) }),
      },
    ],
  },
}

const ALL_TOOLS: readonly ToolDefinition[] = Object.values(TOOL_REGISTRY).sort(
  (a, b) => a.shortcutRank - b.shortcutRank,
)

/** Whether this principal may open the tool: whether they may make its first read. */
export function canOpen(grants: Grants, tool: ToolDefinition): boolean {
  return tool.access.kind === 'public' || grants.canAny(tool.access.entry)
}

/** Every tool the principal may open, rail order. */
export function toolsFor(grants: Grants): readonly ToolDefinition[] {
  return ALL_TOOLS.filter((tool) => canOpen(grants, tool))
}

/** Whether the principal has any workspace at all, beyond the public surfaces. */
export function hasWorkspace(grants: Grants): boolean {
  return toolsFor(grants).some((tool) => tool.access.kind === 'scoped')
}

/** The rail, in order. A principal with no scoped tool gets no rail, rather
 *  than a Home whose every tile is denied. */
export function navFor(grants: Grants): readonly ToolDefinition[] {
  if (!hasWorkspace(grants)) return []
  return toolsFor(grants).filter((tool) => tool.group !== 'hidden')
}

/** Digit shortcuts: the pressed digit, minus one, indexes this list. */
export function shortcutsFor(grants: Grants): readonly ToolPath[] {
  return navFor(grants).map((tool) => tool.path)
}

/** Home tiles the principal may see, in tile-rank order. */
export function homeTilesFor(grants: Grants): readonly ToolDefinition[] {
  return toolsFor(grants)
    .filter((tool) => tool.homeTile)
    .sort((a, b) => (a.homeTile?.rank ?? 0) - (b.homeTile?.rank ?? 0))
}

/** Palette commands the principal may run, rail order. */
export function commandsFor(grants: Grants): readonly ToolCommand[] {
  return navFor(grants).flatMap((tool) => tool.paletteCommands ?? [])
}

/** The tools contributing a fragment — what a shared surface mounts, and nothing else. */
export function contributorsOf<K extends keyof ToolContributions>(
  grants: Grants,
  slot: K,
): readonly (ToolDefinition & { contributions: Required<Pick<ToolContributions, K>> })[] {
  return toolsFor(grants).filter(
    (tool): tool is ToolDefinition & { contributions: Required<Pick<ToolContributions, K>> } =>
      tool.contributions?.[slot] !== undefined,
  )
}

/** The tool a pathname belongs to: the longest registered path that prefixes it. */
export function toolForPath(pathname: string): ToolDefinition {
  const owner = ALL_TOOLS.filter(
    (tool) => tool.path === '/' || pathname === tool.path || pathname.startsWith(`${tool.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)[0]
  return owner ?? TOOL_REGISTRY.home
}

/** The teardowns the named grants pay for; with none named, every one. */
export function teardownsFor(tools?: readonly Tool[]): readonly (() => void)[] {
  const wanted = tools ? new Set<Tool>(tools) : null
  return ALL_TOOLS.flatMap((tool) => {
    const teardown = tool.contributions?.teardown
    if (!teardown) return []
    if (!wanted || teardown.grantedBy.some((granted) => wanted.has(granted))) return [teardown.run]
    return []
  })
}
