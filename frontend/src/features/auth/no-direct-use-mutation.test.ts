/**
 * Every write goes through `useIdentityBoundMutation`.
 *
 * TanStack's `useMutation` judges nothing: a retry, a rollback, or a write
 * paused offline and resumed later runs under whatever identity the tab holds
 * by then. The wrapper binds a mutation to the identity that asked for it. The
 * lint rule refuses the import; this refuses the name anywhere in the source,
 * so a re-export or an alias cannot slip past.
 */
import { describe, expect, it } from 'vite-plus/test'
import { linesMatching, sourceFiles } from '@/test/source-scan'

const ALLOWED = [
  'src/features/auth/use-identity-bound-mutation.ts',
  'src/features/auth/no-direct-use-mutation.test.ts',
]

const PRIMITIVE = /\buseMutation\b/

describe('the mutation primitive', () => {
  it('is named nowhere but the wrapper', () => {
    const files = sourceFiles(['src'], { includeTests: true }).filter(
      (file) => !ALLOWED.includes(file),
    )
    expect(linesMatching(files, PRIMITIVE)).toEqual([])
  })

  it('is still something this check can see', () => {
    expect(PRIMITIVE.test('  return useMutation({')).toBe(true)
    expect(PRIMITIVE.test('  return useIdentityBoundMutation({')).toBe(false)
    expect(PRIMITIVE.test('  type UseMutationOptions,')).toBe(false)
  })
})
