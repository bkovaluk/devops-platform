/**
 * Who you are, under the avatar: name, email, the grants this shell renders
 * from, view-as for an admin, and sign-out. In MSW mode it also lists the
 * principals the mock can answer as, so a scoped shell is one click away.
 */
import { Eye, EyeOff, LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Menu, MenuGroup, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { useAuthStore } from '@/features/auth/auth-store'
import { useScopes } from '@/features/auth/use-scopes'
import { useViewAsStore } from '@/features/auth/view-as'
import {
  chooseMockPrincipal,
  MOCK_PRINCIPALS,
  mockActive,
  mockPrincipal,
} from '@/test/msw/principal'
import { ViewAsDialog } from './ViewAsDialog'

function initials(name: string | null, email: string | null): string {
  const source = name ?? email ?? '?'
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function UserMenu() {
  const principal = useScopes()
  const viewAs = useViewAsStore((state) => state.viewAs)
  const token = useAuthStore((state) => state.token)
  const [viewAsOpen, setViewAsOpen] = useState(false)

  return (
    <>
      <Menu
        align="end"
        className="w-64"
        trigger={
          <button
            type="button"
            aria-label="Account"
            className="grid h-8 w-8 place-items-center rounded-full bg-accent font-mono text-nano font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            {principal.status === 'ready' ? (
              initials(principal.name, principal.email)
            ) : (
              <UserRound aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        }
      >
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <span className="text-label font-medium text-foreground">
            {principal.name ?? 'Signed in'}
          </span>
          <span className="truncate text-xs text-muted-foreground">{principal.email}</span>
          <span className="mt-1 font-mono text-nano text-dim-foreground">
            {principal.scopes.length > 0 ? principal.scopes.join(' · ') : 'No grants'}
          </span>
        </div>
        <MenuSeparator />
        {viewAs ? (
          <MenuItem onSelect={() => useViewAsStore.getState().setViewAs(null)}>
            <EyeOff aria-hidden="true" className="h-3.5 w-3.5 text-state-warn" />
            Leave view-as
          </MenuItem>
        ) : (
          principal.isActorAdmin && (
            <MenuItem onSelect={() => setViewAsOpen(true)}>
              <Eye aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
              View as…
            </MenuItem>
          )
        )}
        {mockActive() && <MockPrincipals />}
        {token && (
          <MenuItem onSelect={() => useAuthStore.getState().signOut()}>
            <LogOut aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
            Sign out
          </MenuItem>
        )}
      </Menu>
      <ViewAsDialog open={viewAsOpen} onOpenChange={setViewAsOpen} />
    </>
  )
}

function MockPrincipals() {
  const current = mockPrincipal()
  return (
    <>
      <MenuGroup label="Mock principal">
        {MOCK_PRINCIPALS.map((name) => (
          <MenuItem
            key={name}
            checked={name === current}
            onSelect={() => chooseMockPrincipal(name)}
          >
            <span
              aria-hidden="true"
              className={name === current ? 'h-1.5 w-1.5 rounded-full bg-signal' : 'h-1.5 w-1.5'}
            />
            {name}
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
    </>
  )
}
