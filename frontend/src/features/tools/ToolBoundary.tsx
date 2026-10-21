/**
 * The gate in front of every tool view. It owns the three states that are not
 * the tool: a content-shaped skeleton while the grants load, "Can't confirm
 * your access" with a Retry when `/auth/me` cannot be read, and "Not part of
 * your access" when the tool is outside the principal's grants. A denied tool
 * is never mounted, so its queries never fire — including one reached by deep
 * link — which is why no view carries a `can(...)` check of its own.
 */
import { Lock, ShieldAlert } from 'lucide-react'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMe } from '@/features/auth/use-auth-me'
import { useScopes } from '@/features/auth/use-scopes'
import { canOpen, type ToolDefinition } from './tool-registry'

export function ToolSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-1 flex-col gap-3 px-gutter-page py-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-64" />
      <Skeleton className="h-3 w-52" />
    </div>
  )
}

export function ToolBoundary({ tool }: { tool: ToolDefinition }) {
  const grants = useScopes()
  const { refetch } = useAuthMe()

  if (grants.status === 'loading') return <ToolSkeleton />

  if (grants.status !== 'ready') {
    return (
      <EmptyState
        className="flex-1"
        icon={<ShieldAlert />}
        title="Can't confirm your access"
        body="Your permissions could not be read. Nothing has changed; try again."
        cta={
          <Button variant="soft" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  if (!canOpen(grants, tool)) {
    return (
      <EmptyState
        className="flex-1"
        icon={<Lock />}
        title="Not part of your access"
        body={`${tool.label} isn't included in your roles. Ask an admin for a role that grants it.`}
      />
    )
  }

  const View = tool.view
  return (
    <Suspense fallback={<ToolSkeleton />}>
      <View />
    </Suspense>
  )
}
