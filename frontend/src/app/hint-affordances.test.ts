/**
 * Hints come from `components/ui/hint.tsx` and nothing else draws one.
 *
 * No native `title`, anywhere: not on an element, and not on a component —
 * `Button`, `IconButton` and `Chip` take a `hint`. The only `title` props
 * allowed are on the components that draw it as a visible heading. Tests ask
 * `toBeActionable` / `toBeUnavailable`, which read `aria-disabled` as well as
 * `disabled`, and never `toBeEnabled`.
 */
import { describe, expect, it } from 'vite-plus/test'
import { linesMatching, openingTags, read, sourceFiles } from '@/test/source-scan'

const HINT_MODULE = 'src/components/ui/hint.tsx'

/** Components whose `title` is a visible heading, not a hover label. */
const HEADS_WITH_TITLE = ['Dialog', 'EmptyState', 'Fold', 'SectionHeader', 'Sheet', 'ViewHeader']

/** A tooltip primitive imported, or one drawn by hand as a tooltip role. */
const STRAY_TOOLTIP =
  /from\s+['"](@base-ui\/react\/tooltip|@base-ui\/react\/preview-card|@\/components\/ui\/tooltip)['"]|role=["']tooltip["']/

function nativeTitles(file: string): string[] {
  return openingTags(read(file), ['[A-Za-z][\\w.]*'])
    .filter((tag) => !HEADS_WITH_TITLE.includes(tag.name))
    .filter((tag) => /\stitle=/.test(tag.source))
    .map((tag) => `${file}:${tag.line} <${tag.name}>`)
}

describe('hints', () => {
  it('are never a native title — use Hint, InfoTip or a hint prop', () => {
    const tsx = sourceFiles(['src']).filter((file) => file.endsWith('.tsx'))
    expect(tsx.flatMap(nativeTitles)).toEqual([])
  })

  it('are drawn by the hint module alone', () => {
    const others = sourceFiles(['src']).filter((file) => file !== HINT_MODULE)
    expect(linesMatching(others, STRAY_TOOLTIP)).toEqual([])
  })

  it('leave no test asking toBeEnabled — use toBeActionable', () => {
    const tests = sourceFiles(['src'], { includeTests: true }).filter((file) =>
      /\.test\.tsx?$/.test(file),
    )
    const asking = linesMatching(tests, /\.toBeEnabled\(/).filter(
      (line) => !line.startsWith('src/app/hint-affordances.test.ts'),
    )
    expect(asking).toEqual([])
  })

  it('are found by this check in the first place', () => {
    const tags = openingTags('<span title="Full name">Name</span>', ['[A-Za-z][\\w.]*'])
    expect(tags.filter((tag) => /\stitle=/.test(tag.source))).toHaveLength(1)
    expect(STRAY_TOOLTIP.test("import { Tooltip } from '@base-ui/react/tooltip'")).toBe(true)
    expect(STRAY_TOOLTIP.test('<span role="tooltip" popover="manual">Full name</span>')).toBe(true)
  })
})
