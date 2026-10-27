/**
 * Where you are, as a path: `App / ● env / Tool`. The env is a crumb of its
 * own, in its own colour, and pressing it is how the env is picked. The menu
 * lists every pick every time; one the open tool cannot show, or an env the
 * principal cannot read there, stays in the list, greyed, with the reason.
 * ⌥0 picks every env and ⌥1 onwards the deployment's, in menu order.
 *
 * A tool tied to no env says so in a crumb that cannot be pressed. Home has
 * no tool crumb. Where the rail spells the app's name out, the path starts at
 * the env, so the bar does not say it twice.
 */
import { Check, ChevronDown, Layers } from 'lucide-react'
import { Hint } from '@/components/ui/hint'
import { Menu, MenuItem } from '@/components/ui/menu'
import { useConfig } from '@/features/config/use-config'
import type { ToolDefinition } from '@/features/tools/tool-registry'
import { ALL_ENVS, envDotClass, envLabel, envTextClass } from '@/lib/env'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import { type EnvPick, useChoosePick, useEnvScope, usePicks } from './env-pick'

const CRUMB =
  'inline-flex h-8 min-w-0 shrink-0 items-center gap-2 rounded-md px-2 text-xs font-semibold outline-none transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

/** A pick's mark: an env's dot, or the stack every env together is. */
function PickMark({ pick, muted = false }: { pick: EnvPick | null; muted?: boolean }) {
  if (pick === null || pick === ALL_ENVS) {
    return <Layers aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
  }
  return (
    <span
      aria-hidden="true"
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', envDotClass(pick), muted && 'opacity-25')}
    />
  )
}

function Separator({ className }: { className?: string }) {
  return (
    <li aria-hidden="true" className={cn('shrink-0 px-0.5 text-dim-foreground', className)}>
      /
    </li>
  )
}

/** The pick, and the menu that changes it. */
function PickCrumb({ tool }: { tool: ToolDefinition }) {
  const { pick, shown, refusalOf } = useEnvScope(tool)
  const choose = useChoosePick(tool)
  const picks = usePicks()
  const faint = shown === null
  return (
    <Menu
      className="min-w-52"
      trigger={
        <button
          type="button"
          aria-label={`Environment: ${envLabel(pick)}`}
          className={cn(
            CRUMB,
            'cursor-pointer hover:bg-accent',
            faint || pick === ALL_ENVS ? 'text-muted-foreground' : envTextClass(pick),
          )}
        >
          <PickMark pick={pick} muted={faint} />
          <span className="truncate">{envLabel(pick)}</span>
          <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0 text-dim-foreground" />
        </button>
      }
    >
      {picks.map((each) => {
        const reason = refusalOf(each)
        return (
          <MenuItem
            key={each}
            checked={each === pick}
            disabled={reason !== null}
            onSelect={() => choose(each)}
          >
            <span className="flex w-3 shrink-0 justify-center">
              <PickMark pick={each} muted={reason !== null} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{envLabel(each).split(' · ')[0]}</span>
              {reason && <span className="text-nano text-dim-foreground">{reason}</span>}
            </span>
            {each === 'prod' && <span className="text-nano text-env-prod">live</span>}
            {each === pick && <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-signal" />}
          </MenuItem>
        )
      })}
    </Menu>
  )
}

/** The crumb of a tool the pick does not steer: it says so, and why, on hover. */
function NoEnvCrumb({ tool }: { tool: ToolDefinition }) {
  const { refusalOf } = useEnvScope(tool)
  return (
    <Hint label={refusalOf(ALL_ENVS)} side="bottom">
      <button
        type="button"
        disabled
        aria-label="Environment: none"
        className={cn(CRUMB, 'cursor-default text-dim-foreground')}
      >
        <PickMark pick={null} muted />
        <span>No env</span>
      </button>
    </Hint>
  )
}

export function EnvBreadcrumb({ tool }: { tool: ToolDefinition }) {
  const appName = useConfig().data?.app_name ?? 'DevOps Platform'
  const railNamesIt = !useUIStore((state) => state.sidebarCollapsed)
  const lead = cn('hidden sm:block', railNamesIt && 'md:hidden')
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-xs">
        <li className={cn('shrink-0 font-display font-semibold text-muted-foreground', lead)}>
          {appName}
        </li>
        <Separator className={lead} />
        <li className="flex min-w-0 shrink-0">
          {tool.env === 'none' ? <NoEnvCrumb tool={tool} /> : <PickCrumb tool={tool} />}
        </li>
        {tool.title && (
          <>
            <Separator />
            <li aria-current="page" className="min-w-0 truncate font-medium text-foreground">
              {tool.title}
            </li>
          </>
        )}
      </ol>
    </nav>
  )
}
