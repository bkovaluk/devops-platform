/**
 * The route tree. Every piece of URL state is a validated search param or a
 * path param declared here (or in the schema module a route names), so a
 * component reads typed values and a bad link degrades to defaults instead of
 * crashing a view.
 *
 * Each tool's root route renders `ToolBoundary` around the registry's view, so
 * a denied tool is never mounted — including one reached by deep link.
 * Adding a tool: declare it in `features/tools/tool-registry.tsx`, add its
 * route(s) here, and `tool-registry.test.tsx` checks the two agree.
 */
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from '@tanstack/react-router'
import { z } from 'zod'
import { AppShell } from '@/app/AppShell'
import { NotFound } from '@/app/layout/NotFound'
import { approvalsSearchSchema } from '@/features/approvals/approval-search'
import { flagSearchSchema, flagsSearchSchema } from '@/features/flags/flag-search'
import { TOOL_REGISTRY } from '@/features/tools/tool-registry'
import { ToolBoundary } from '@/features/tools/ToolBoundary'
import { queryClient } from '@/lib/query-client'

/** The shell's own search: the environment every tool reads. Absent is `all`
 *  for a list, and a single-env page names its env in its path. */
export const rootSearchSchema = z.object({
  env: z.string().min(1).optional().catch(undefined),
})

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: rootSearchSchema,
  component: AppShell,
  notFoundComponent: NotFound,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <ToolBoundary tool={TOOL_REGISTRY.home} />,
})

const approvalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'approvals',
  validateSearch: approvalsSearchSchema,
  component: () => <ToolBoundary tool={TOOL_REGISTRY.approvals} />,
})

const flagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'flags',
  validateSearch: flagsSearchSchema,
  component: () => <ToolBoundary tool={TOOL_REGISTRY.flags} />,
})

const flagsIndexRoute = createRoute({
  getParentRoute: () => flagsRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@/app/flags/FlagIdle'), 'FlagIdle'),
})

const flagRoute = createRoute({
  getParentRoute: () => flagsRoute,
  path: '$env/$key',
  validateSearch: flagSearchSchema,
  component: lazyRouteComponent(() => import('@/app/flags/FlagDetail'), 'FlagDetail'),
})

export const routeTree = rootRoute.addChildren([
  homeRoute,
  approvalsRoute,
  flagsRoute.addChildren([flagsIndexRoute, flagRoute]),
])

export function createAppRouter(client: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient: client },
    defaultPreload: 'intent',
    scrollRestoration: true,
  })
}

export const router = createAppRouter(queryClient)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
