/**
 * Buttons: two heights from `size`, an icon alone is an `IconButton`, and the
 * loading look is `Skeleton`'s.
 *
 * A call site never sets a button's height with a class, never builds an
 * icon-only `Button` (it has no name and no hint), and never draws its own
 * shimmer or spinner.
 */
import { describe, expect, it } from 'vite-plus/test'
import { attribute, linesMatching, openingTags, read, sourceFiles } from '@/test/source-scan'

const FILES = sourceFiles(['src']).filter((file) => file.endsWith('.tsx'))

function buttonTags(): { file: string; line: number; source: string }[] {
  return FILES.flatMap((file) =>
    openingTags(read(file), ['Button', 'IconButton']).map((tag) => ({ file, ...tag })),
  )
}

describe('controls', () => {
  it('take their height from size, never from a class at the call site', () => {
    const sized = buttonTags()
      .filter((tag) => /\bh-\d/.test(attribute(tag.source, 'className') ?? ''))
      .map((tag) => `${tag.file}:${tag.line}`)
    expect(sized).toEqual([])
  })

  it('name an icon alone with IconButton, not an icon-sized Button', () => {
    const iconSized = buttonTags()
      .filter((tag) => tag.source.startsWith('<Button') && /size="icon(-sm)?"/.test(tag.source))
      .map((tag) => `${tag.file}:${tag.line}`)
    expect(iconSized).toEqual([])
  })

  it('leave the shimmer to Skeleton and spinners to nobody', () => {
    const others = sourceFiles(['src']).filter((file) => file !== 'src/components/ui/skeleton.tsx')
    expect(linesMatching(others, /['" ]shimmer['" ]/)).toEqual([])
    expect(linesMatching(others, /animate-spin/)).toEqual([])
  })
})
