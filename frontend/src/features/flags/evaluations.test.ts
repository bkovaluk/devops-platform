import { describe, expect, it } from 'vite-plus/test'
import type { EvaluationSeries } from '@/types/api'
import { changeMarkers, medianOf, minuteReading, stripColumns, windowSummary } from './evaluations'

const series: EvaluationSeries = {
  key: 'checkout-v2',
  env: 'staging',
  points: [
    { t: '2026-10-20T18:00:00.000Z', evaluations: 0, enabled_share: null },
    { t: '2026-10-20T18:01:00.000Z', evaluations: 100, enabled_share: 0.5 },
    { t: '2026-10-20T18:02:00.000Z', evaluations: 400, enabled_share: 0.25 },
    { t: '2026-10-20T18:03:00.000Z', evaluations: 25, enabled_share: 0.4 },
  ],
}

describe('evaluations', () => {
  it('draws a minute with no evaluations as a gap, never a short column', () => {
    const columns = stripColumns(series)
    expect(columns[0]?.share).toBeNull()
    expect(columns[0]?.label).toBe('18:00 UTC, no evaluations')
  })

  it('scales minutes on a square root of the busiest one', () => {
    const columns = stripColumns(series)
    expect(columns[2]?.share).toBe(1)
    expect(columns[1]?.share).toBeCloseTo(0.5)
    expect(columns[3]?.share).toBeCloseTo(0.25)
  })

  it('sums the window into one line', () => {
    expect(windowSummary(series)).toBe('525 evaluations · 30% enabled')
    expect(windowSummary({ ...series, points: [] })).toBe('No evaluations')
  })

  it('takes the median over active minutes only', () => {
    expect(medianOf([100, 400, 25])).toBe(100)
    expect(medianOf([1, 3])).toBe(2)
    expect(medianOf([])).toBeNull()
  })

  it('marks the minute somebody changed the flag', () => {
    const changedAt = '2026-10-20T18:02:31.000Z'
    expect(changeMarkers(series, changedAt)).toEqual([
      { key: 'changed', offset: 2.5 / 4, tone: 'foreground' },
    ])
    expect(changeMarkers(series, '2026-10-19T00:00:00.000Z')).toEqual([])
    expect(minuteReading(series, 2, changedAt)).toMatchObject({
      evaluations: 400,
      enabledShare: 0.25,
      median: 100,
      changedHere: true,
    })
    expect(minuteReading(series, 9, changedAt)).toBeNull()
  })
})
