import { describe, expect, it } from 'vite-plus/test'
import {
  ALL_TOOLS,
  CONFORMANCE_CASES,
  CONTRACT,
  canAny,
  grantsForTool,
  inAnyEnv,
  parseGrant,
  parseScope,
  satisfies,
} from './permissions'

describe('the scope contract', () => {
  it('declares exactly the tools and actions the UI types', () => {
    // A tool or action added upstream fails here until the unions in
    // permissions.ts name it too.
    expect([...ALL_TOOLS].sort()).toEqual(['approvals', 'findings', 'flags'])
    expect([...new Set(Object.values(CONTRACT.tools).flat())].sort()).toEqual([
      'read',
      'review',
      'write',
    ])
  })

  it('seeds roles whose every grant parses', () => {
    for (const grants of Object.values(CONTRACT.roles)) {
      for (const grant of grants) expect(parseGrant(grant), grant).not.toBeNull()
    }
  })

  it('refuses everything the API refuses', () => {
    for (const grant of CONTRACT.invalid_grants) expect(parseGrant(grant), grant).toBeNull()
    for (const scope of CONTRACT.invalid_requirements) expect(parseScope(scope), scope).toBeNull()
  })
})

describe('matching', () => {
  it.each(CONFORMANCE_CASES)(
    '$grant against $required is $expected',
    ({ grant, required, expected }) => {
      if (expected === 'invalid') {
        expect(parseGrant(grant) === null || parseScope(required) === null).toBe(true)
        expect(satisfies(grant, required)).toBe(false)
        return
      }
      expect(satisfies(grant, required)).toBe(expected)
    },
  )

  it('reaches a list through a grant narrowed to any one environment', () => {
    expect(canAny(['flags:read:staging'], inAnyEnv('flags', 'read'))).toBe(true)
    expect(canAny(['flags:write'], inAnyEnv('flags', 'read'))).toBe(false)
  })

  it('tells which grants bear on a tool', () => {
    expect(grantsForTool(['*', 'flags:read', 'approvals:review'], 'flags')).toEqual([
      '*',
      'flags:read',
    ])
  })
})
