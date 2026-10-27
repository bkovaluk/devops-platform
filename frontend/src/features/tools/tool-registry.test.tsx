import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it } from 'vite-plus/test'
import { grantsOf } from '@/features/auth/permissions'
import { createQueryClient } from '@/lib/query-client'
import { createAppRouter } from '@/router'
import {
  canOpen,
  commandsFor,
  contributorsOf,
  homeTilesFor,
  navFor,
  shortcutsFor,
  TOOL_REGISTRY,
  teardownsFor,
  toolForPath,
} from './tool-registry'

const admin = grantsOf(['*'])
const viewer = grantsOf(['flags:read'])
const nobody = grantsOf([])

describe('the tool registry', () => {
  it('declares every tool at a route the router knows', () => {
    const router = createAppRouter(createQueryClient(), createMemoryHistory())
    const paths = Object.keys(router.routesByPath)
    for (const tool of Object.values(TOOL_REGISTRY)) expect(paths, tool.id).toContain(tool.path)
  })

  it('opens a tool on its entry scope, and the public ones to everyone', () => {
    expect(canOpen(nobody, TOOL_REGISTRY.home)).toBe(true)
    expect(canOpen(nobody, TOOL_REGISTRY.flags)).toBe(false)
    expect(canOpen(grantsOf(['flags:read']), TOOL_REGISTRY.flags)).toBe(true)
    // A grant narrowed to one environment still opens the tool there.
    expect(canOpen(grantsOf(['flags:read:prod']), TOOL_REGISTRY.flags)).toBe(true)
    // The inbox shows requests about what you can read; reviewing alone sees none.
    expect(canOpen(grantsOf(['flags:read']), TOOL_REGISTRY.approvals)).toBe(true)
    expect(canOpen(grantsOf(['approvals:review']), TOOL_REGISTRY.approvals)).toBe(false)
    expect(canOpen(viewer, TOOL_REGISTRY.investigations)).toBe(false)
    expect(canOpen(grantsOf(['findings:read:prod']), TOOL_REGISTRY.investigations)).toBe(true)
  })

  it('gives a principal with no workspace no rail at all', () => {
    expect(navFor(nobody)).toEqual([])
    expect(shortcutsFor(nobody)).toEqual([])
  })

  it('orders the rail and the digit shortcuts by rank', () => {
    expect(navFor(viewer).map((tool) => tool.id)).toEqual(['home', 'approvals', 'flags'])
    expect(shortcutsFor(admin)).toEqual(['/', '/approvals', '/flags', '/investigations'])
  })

  it('hands shared surfaces only the contributions of tools they may open', () => {
    expect(contributorsOf(admin, 'palette').map((tool) => tool.id)).toEqual(['flags'])
    expect(contributorsOf(grantsOf(['approvals:review']), 'palette')).toEqual([])
    expect(contributorsOf(viewer, 'count').map((tool) => tool.id)).toEqual(['approvals'])
    expect(homeTilesFor(viewer).map((tool) => tool.id)).toEqual(['flags'])
    expect(commandsFor(nobody)).toEqual([])
  })

  it('finds the tool a pathname belongs to', () => {
    expect(toolForPath('/flags/staging/checkout-v2').id).toBe('flags')
    expect(toolForPath('/approvals').id).toBe('approvals')
    expect(toolForPath('/investigations/prod/f-checkout-0001').id).toBe('investigations')
    expect(toolForPath('/').id).toBe('home')
    expect(toolForPath('/flagsmith').id).toBe('home')
  })

  it('holds no state outside the query cache, so there is nothing to tear down', () => {
    expect(teardownsFor()).toEqual([])
  })
})
