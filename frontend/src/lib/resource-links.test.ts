import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it } from 'vite-plus/test'
import { createAppRouter } from '@/router'
import { createQueryClient } from './query-client'
import { buildResourceLink, type ResourceLink, resourcePath } from './resource-links'

const LINKS: readonly [ResourceLink, string][] = [
  [{ kind: 'flag', key: 'checkout-v2', env: 'staging' }, '/flags/$env/$key'],
  [{ kind: 'flags', env: 'prod' }, '/flags/'],
  [{ kind: 'approval', id: 'apr_1001' }, '/approvals'],
  [{ kind: 'finding', id: 'f-checkout-0001', env: 'prod' }, '/investigations/$env/$findingId'],
  [{ kind: 'findings', env: 'staging' }, '/investigations/'],
]

describe('resource links', () => {
  const router = createAppRouter(createQueryClient(), createMemoryHistory())

  it.each(LINKS)('%o opens a route the router knows', (link, routeId) => {
    const url = new URL(resourcePath(link), 'http://localhost')
    const matches = router.matchRoutes(url.pathname, Object.fromEntries(url.searchParams))
    expect(matches.at(-1)?.routeId).toBe(routeId)
  })

  it('carries the env and the key a flag link names', () => {
    expect(resourcePath({ kind: 'flag', key: 'a.b-c', env: 'prod' })).toBe('/flags/prod/a.b-c')
  })

  it('is absolute, so it can be pasted anywhere', () => {
    expect(buildResourceLink({ kind: 'approval', id: 'apr_1' }, 'https://ops.example.com')).toBe(
      'https://ops.example.com/approvals?status=all&id=apr_1',
    )
  })
})
