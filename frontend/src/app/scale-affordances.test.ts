/**
 * One spacing and type scale.
 *
 * Type has seven steps (nano 11, xs 12, label 13, sm 14, heading 15, base 16,
 * title 17); display sizes of 18px and up may be arbitrary, nothing under. A
 * box is a `Panel` at `rounded-lg`, a list a `ListCard` at `rounded-xl`, and
 * nothing is `rounded-2xl`. Gutters are tokens (`px-gutter-page`, `-list`,
 * `-pane`), never a pixel count, and only overlays and the framed panel cast a
 * shadow (`shadow-overlay`, `shadow-workspace`).
 */
import { describe, expect, it } from 'vite-plus/test'
import { linesMatching, sourceFiles } from '@/test/source-scan'

const FILES = sourceFiles(['src'])

function smallArbitraryText(files: readonly string[]): string[] {
  return files.flatMap((file) =>
    linesMatching([file], /text-\[\d+px\]/).filter((line) =>
      [...line.matchAll(/text-\[(\d+)px\]/g)].some((m) => Number(m[1]) < 18),
    ),
  )
}

describe('the scale', () => {
  it('has no arbitrary text size under 18px', () => {
    expect(smallArbitraryText(FILES)).toEqual([])
  })

  it('has no rounded-2xl', () => {
    expect(linesMatching(FILES, /\brounded-2xl\b/)).toEqual([])
  })

  it('has no pixel gutters', () => {
    expect(linesMatching(FILES, /\bpx-\[\d/)).toEqual([])
  })

  it('casts only the overlay and workspace shadows', () => {
    expect(linesMatching(FILES, /\bshadow-(md|lg|xl|2xl)\b/)).toEqual([])
  })

  it('is found by this check in the first place', () => {
    expect('text-[12px]'.match(/text-\[(\d+)px\]/)?.[1]).toBe('12')
  })
})
