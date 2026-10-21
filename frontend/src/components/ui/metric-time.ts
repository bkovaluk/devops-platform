/**
 * The clock and the numerals the quiet-columns chart reads by. Every bucket is
 * dated by counting back from the anchor — the instant the window closes on —
 * so a caller hands over counts and never a clock of its own.
 */

export const MINUTE = 60_000
export const HOUR = 3_600_000

/** Tick spacing, in buckets: the first that leaves eight labels or fewer. */
const TICK_STEPS = [1, 2, 3, 5, 6, 10, 12, 15, 20, 30, 60, 120]

/** A count at the width an edge has for it: thousands in thousands. */
export function trackNumeral(count: number): string {
  if (count < 1_000) return String(count)
  return `${(count / 1_000).toFixed(count % 1_000 ? 1 : 0)}k`
}

/** "14:05 UTC" for a moment. */
export function clockOf(at: Date | null): string {
  return at ? `${at.toISOString().slice(11, 16)} UTC` : ''
}

/** When a bucket opens: the newest one closes at the anchor. Null where the
 *  anchor cannot be read. */
export function bucketStart(
  anchor: string,
  bucket: number,
  count: number,
  bucketMs: number,
): Date | null {
  const at = new Date(anchor)
  if (Number.isNaN(at.getTime())) return null
  return new Date(at.getTime() - (count - bucket) * bucketMs)
}

/** Which buckets carry a tick. */
export function tickStep(count: number): number {
  return TICK_STEPS.find((step) => count / step <= 8) ?? Math.ceil(count / 8)
}
