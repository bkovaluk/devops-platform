/**
 * One row recipe and one look for status and environment.
 *
 * A hover is the solid `bg-accent`, never a translucent foreground veil. A
 * selection is `SELECTED_ROW` / `SELECTED_BAR`, never an inset-shadow bar.
 * State colour comes from the `state-*` tokens alone — no raw rose, emerald or
 * amber palette step in a surface — and an environment's colour from
 * `lib/env.ts` (`EnvSignal`), never a hand-picked `bg-env-*`.
 */
import { describe, expect, it } from 'vite-plus/test'
import { linesMatching, sourceFiles } from '@/test/source-scan'

const FILES = sourceFiles(['src'])

/** Where the palette steps are defined, and so may be named. */
const PALETTE_OWNERS = ['src/components/ui/button-variants.ts', 'src/lib/theme-constants.ts']

describe('rows, status and environments', () => {
  it('hover with the accent fill, never a veil', () => {
    const veils = linesMatching(
      FILES.filter((file) => file !== 'src/components/ui/button-variants.ts'),
      /hover:bg-foreground\//,
    )
    expect(veils).toEqual([])
  })

  it('mark a selection with SELECTED_ROW, never an inset shadow', () => {
    expect(linesMatching(FILES, /shadow-\[inset/)).toEqual([])
  })

  it('take state colour from the state tokens', () => {
    const raw = linesMatching(
      FILES.filter((file) => !PALETTE_OWNERS.includes(file)),
      /\b(text|bg|border)-(rose|emerald|amber|red|green|yellow)-\d{3}\b/,
    )
    expect(raw).toEqual([])
  })

  it('take environment colour from lib/env.ts', () => {
    const handRolled = linesMatching(
      FILES.filter((file) => file !== 'src/lib/env.ts'),
      /\bbg-env-(dev|qa|staging|prod|other)\b/,
    )
    expect(handRolled).toEqual([])
  })
})
