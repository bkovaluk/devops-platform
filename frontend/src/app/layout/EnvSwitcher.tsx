/**
 * The environment, said in a stable place: "Staging", "Prod · Live", "All
 * envs". The options are the deployment's own (`/config`). On a page about one
 * env's resource, switching opens the same resource in the other env and
 * "All environments" is not offered; everywhere else the choice is the shell's
 * `env` search param.
 */
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, Layers, Lock } from 'lucide-react'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { useEnvironments } from '@/features/config/use-config'
import { ALL_ENVS, envDotClass, envLabel } from '@/lib/env'
import { cn } from '@/lib/utils'
import { withViewTransition } from '@/lib/view-transition'
import { useFocusedEnv } from './use-focused-env'

export function EnvSwitcher() {
  const environments = useEnvironments()
  const { env, pinned } = useFocusedEnv()
  const navigate = useNavigate()
  const isAll = env === ALL_ENVS
  const isProd = env === 'prod'

  const choose = (next: string) =>
    withViewTransition(() => {
      if (pinned) {
        void navigate({
          to: '.',
          params: (prev: Record<string, string>) => ({ ...prev, env: next }),
        })
        return
      }
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          env: next === ALL_ENVS ? undefined : next,
        }),
      })
    })

  return (
    <Menu
      className="min-w-44"
      trigger={
        <button
          type="button"
          aria-label={`Environment: ${envLabel(env)}`}
          className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <span className="flex w-3 shrink-0 items-center justify-center">
            {isAll ? (
              <Layers aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
            ) : (
              <span
                aria-hidden="true"
                className={cn('h-1.5 w-1.5 rounded-full', envDotClass(env))}
              />
            )}
          </span>
          {isProd && <Lock aria-hidden="true" className="h-3 w-3 text-env-prod" />}
          <span
            className={cn(
              'min-w-[5.25rem] truncate text-left',
              isProd ? 'text-env-prod' : 'text-foreground',
            )}
          >
            {envLabel(env)}
          </span>
          <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0 text-dim-foreground" />
        </button>
      }
    >
      {environments.map((name) => (
        <MenuItem key={name} onSelect={() => choose(name)}>
          <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', envDotClass(name))} />
          <span className="flex-1">{envLabel(name).split(' · ')[0]}</span>
          {name === 'prod' && <span className="text-nano text-env-prod">live</span>}
        </MenuItem>
      ))}
      {!pinned && (
        <>
          <MenuSeparator />
          <MenuItem onSelect={() => choose(ALL_ENVS)}>
            <Layers aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
            <span className="flex-1">All environments</span>
            <span className="text-nano text-dim-foreground">read-only</span>
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
