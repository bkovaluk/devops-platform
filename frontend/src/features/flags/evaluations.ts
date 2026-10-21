/**
 * A flag's last hour of evaluations, as the strip and its minute popover read
 * it. Pure: the series in, columns and readings out.
 *
 * A minute is scaled on a square root of the window's busiest minute, so a
 * quiet minute beside a burst still shows as a shape rather than a hairline.
 * A minute with no evaluations answered nothing, and draws as a dotted stub —
 * never as a short column, which would claim a reading nobody took.
 */
import type { StripColumn, StripMarker } from '@/components/ui/metric-track'
import type { EvaluationPoint, EvaluationSeries } from '@/types/api'

export interface MinuteReading {
  at: string
  evaluations: number
  /** Share answered enabled, 0..1, or null for a minute with none. */
  enabledShare: number | null
  /** The window's median evaluations per active minute. */
  median: number | null
  /** Whether the flag was last changed inside this minute. */
  changedHere: boolean
}

export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function minuteLabel(point: EvaluationPoint): string {
  const clock = `${point.t.slice(11, 16)} UTC`
  if (point.evaluations === 0) return `${clock}, no evaluations`
  const share =
    point.enabled_share === null ? '' : `, ${Math.round(point.enabled_share * 100)}% enabled`
  return `${clock}, ${point.evaluations.toLocaleString()} evaluations${share}`
}

export function stripColumns(series: EvaluationSeries): StripColumn[] {
  const peak = Math.max(1, ...series.points.map((point) => point.evaluations))
  return series.points.map((point) => ({
    key: point.t,
    share: point.evaluations === 0 ? null : Math.sqrt(point.evaluations / peak),
    tone: 'plain',
    label: minuteLabel(point),
  }))
}

/** Which minute of the window an instant falls in, or -1 outside it. */
export function minuteIndexOf(series: EvaluationSeries, iso: string): number {
  const at = new Date(iso).getTime()
  return series.points.findIndex((point) => {
    const start = new Date(point.t).getTime()
    return at >= start && at < start + 60_000
  })
}

/** The change a person made to the flag, where it falls inside the window. */
export function changeMarkers(series: EvaluationSeries, updatedAt: string): StripMarker[] {
  const index = minuteIndexOf(series, updatedAt)
  if (index < 0 || series.points.length === 0) return []
  return [{ key: 'changed', offset: (index + 0.5) / series.points.length, tone: 'foreground' }]
}

export function minuteReading(
  series: EvaluationSeries,
  index: number,
  updatedAt: string,
): MinuteReading | null {
  const point = series.points[index]
  if (!point) return null
  const active = series.points.filter((p) => p.evaluations > 0).map((p) => p.evaluations)
  return {
    at: point.t,
    evaluations: point.evaluations,
    enabledShare: point.enabled_share,
    median: medianOf(active),
    changedHere: minuteIndexOf(series, updatedAt) === index,
  }
}

/** The whole window in one line: "3,120 evaluations · 25% enabled". */
export function windowSummary(series: EvaluationSeries): string {
  const total = series.points.reduce((sum, point) => sum + point.evaluations, 0)
  if (total === 0) return 'No evaluations'
  const enabled = series.points.reduce(
    (sum, point) => sum + point.evaluations * (point.enabled_share ?? 0),
    0,
  )
  return `${total.toLocaleString()} evaluations · ${Math.round((enabled / total) * 100)}% enabled`
}
