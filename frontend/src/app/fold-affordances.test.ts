/**
 * Everything that collapses looks collapsible: a section is `Fold`, a row is
 * `FoldRow`, "+N more" is `ShowMore` (`components/ui/fold.tsx`). A surface
 * never hand-writes `aria-expanded` or a `<details>`.
 */
import { describe, expect, it } from 'vite-plus/test'
import { linesMatching, sourceFiles } from '@/test/source-scan'

/**
 * The one disclosure that is not a fold: the rail's collapse toggle changes
 * the shell's layout, it does not reveal a body.
 */
const NOT_FOLDS = ['src/app/layout/Sidebar.tsx']

describe('folds', () => {
  it('are drawn by the fold module, never by hand', () => {
    const files = sourceFiles(['src/app', 'src/components', 'src/features'], {
      exclude: ['src/components/ui', ...NOT_FOLDS],
    })
    expect(linesMatching(files, /aria-expanded|<details/)).toEqual([])
  })
})
