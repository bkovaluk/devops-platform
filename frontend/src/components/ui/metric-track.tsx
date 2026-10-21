/**
 * A window of one reading, drawn as quiet columns — the app's one chart.
 *
 * Every bucket is a thin, flat stroke of data ink about half its slot, with a
 * 1px rounded top: no gradient, no glow, no shadow. Colour is spent only where
 * a reading went wrong (`--state-warn` degraded, `--state-bad` failed), so a
 * wall of healthy columns is one quiet shape and the coloured one reads as the
 * exception. Failures hang in a short lane of their own under the baseline, on
 * their own scale: a bucket that failed did not stop counting.
 *
 * Numbers live on one right-aligned mono line over the chart: the bucket under
 * the pointer or the keyboard, else the one held open ("Open · …"), else the
 * window's totals. Inside the plot there is one dotted rule at the peak with
 * its count at the right edge.
 *
 * Each bucket is a button and the chart holds one tab stop: the arrows walk
 * the buckets. Every bucket is dated by counting back from `anchor`, the
 * instant the window closes on, so a caller hands over counts and never a clock.
 *
 * `MetricStrip` is the same columns at the height of a row.
 */
import { type ReactNode, type Ref, useImperativeHandle, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Hint } from './hint'
import { bucketStart, clockOf, HOUR, tickStep, trackNumeral } from './metric-time'

const DEFAULT_HEIGHT = 112
/** Under this a chart is a shape, not a reading: no peak rule. */
const COMPACT_HEIGHT = 60
const FAILURE_SHARE = 0.16
const MIN_FAILURE_LANE = 8
const BASELINE_GAP = 4
const MIN_FAILURE = 3
const COLUMN_WIDTH = '55%'
const COLUMN_INSET = '22.5%'
const OPEN_MARGIN = 3
/** The right-edge strip the peak count is printed in. */
const PEAK_GUTTER = 30
const ROW_HEIGHT = 28
/** How long one column waits behind the one before it, in ms. */
const STAGGER = 12

export type MetricTone = 'plain' | 'warn' | 'bad'

const INK: Record<MetricTone, string> = {
  plain: 'bg-data-ink',
  warn: 'bg-state-warn',
  bad: 'bg-state-bad',
}

function dottedAcross(colour: string, dash: number, gap: number): string {
  return `repeating-linear-gradient(to right, ${colour} 0 ${dash}px, transparent ${dash}px ${dash + gap}px)`
}

function joined(parts: readonly ReactNode[]): ReactNode {
  return parts
    .filter((part) => part !== null && part !== '')
    .map((part, index) => (
      <span key={index}>
        {index > 0 && ' · '}
        {part}
      </span>
    ))
}

export interface MetricTrackHandle {
  focusSelected: () => void
}

export interface MetricBar {
  bucket: number
  /** What the bucket counted; the peak is taken from these. */
  value: number
  /** What a reader who cannot see the column is told. */
  label: string
  /** What the readout line says the bucket counted, after its time. */
  readings: readonly string[]
}

interface MetricTrackProps {
  bars: readonly MetricBar[]
  anchor: string
  /** How long one bucket is. */
  bucketMs?: number
  label: string
  selected: number | null
  onSelect: (bucket: number) => void
  failures?: readonly number[]
  height?: number
  axis?: 'labels' | 'none'
  tone?: MetricTone
  head?: ReactNode
  idleReading?: string
  hint?: string
  onDismiss?: () => void
  ref?: Ref<MetricTrackHandle>
}

export function MetricTrack({
  bars,
  anchor,
  bucketMs = HOUR,
  label,
  selected,
  onSelect,
  failures,
  height = DEFAULT_HEIGHT,
  axis = 'labels',
  tone = 'plain',
  head,
  idleReading,
  hint,
  onDismiss,
  ref,
}: MetricTrackProps) {
  const barRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [roving, setRoving] = useState<number | null>(null)
  const [reading, setReading] = useState<number | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      focusSelected: () => {
        if (selected !== null) barRefs.current[selected]?.focus()
      },
    }),
    [selected],
  )

  const dense = height < COMPACT_HEIGHT
  const peak = Math.max(1, ...bars.map((bar) => bar.value))
  const ruled = axis !== 'none' && !dense
  const gutter = ruled ? PEAK_GUTTER : 0

  const failed = failures
    ? bars.map((_, index) => {
        const count = failures[index]
        return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
      })
    : null
  const failPeak = failed ? Math.max(1, ...failed) : 1
  const failedTotal = failed ? failed.reduce((sum, count) => sum + count, 0) : 0
  const failureLane = failed ? Math.max(MIN_FAILURE_LANE, Math.round(height * FAILURE_SHARE)) : 0

  const stop = roving ?? selected ?? bars.length - 1
  const openIndex = selected === null ? -1 : bars.findIndex((bar) => bar.bucket === selected)

  const failedPart = (count: number): ReactNode =>
    count > 0 ? <span className="text-state-bad">{`${count.toLocaleString()} failed`}</span> : null

  const readingOf = (index: number, open: boolean): ReactNode => {
    const bar = bars[index]
    if (!bar) return null
    return joined([
      open ? 'Open' : null,
      clockOf(bucketStart(anchor, bar.bucket, bars.length, bucketMs)),
      ...bar.readings.map((text) => (
        <span key={text} className="text-foreground">
          {text}
        </span>
      )),
      failedPart(failed?.[index] ?? 0),
    ])
  }

  const readout =
    reading !== null && bars[reading]
      ? readingOf(reading, false)
      : openIndex >= 0
        ? readingOf(openIndex, true)
        : idleReading !== undefined
          ? joined([
              <span key="idle" className="text-foreground">
                {idleReading}
              </span>,
              failedPart(failedTotal),
            ])
          : null

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        {head}
        <output
          aria-live="polite"
          className="ml-auto min-h-4 min-w-0 text-right font-mono text-xs tabular-nums text-muted-foreground"
        >
          {readout}
        </output>
      </div>

      <div className="relative" style={{ paddingRight: gutter }}>
        {ruled && (
          <span aria-hidden="true">
            <span
              data-track="rule"
              className="pointer-events-none absolute top-0 left-0 h-px"
              style={{ right: gutter, backgroundImage: dottedAcross('var(--input)', 1, 3) }}
            />
            <span
              data-track="peak"
              className="pointer-events-none absolute top-0 right-0 -translate-y-1/2 font-mono text-nano leading-none tabular-nums text-dim-foreground"
            >
              {trackNumeral(peak)}
            </span>
          </span>
        )}

        <Hint label={hint} wrap side="bottom">
          <div
            role="group"
            aria-label={label}
            className="relative flex items-stretch"
            style={{ height }}
          >
            {bars.map((bar, index) => {
              const isSelected = bar.bucket === selected
              const share = Math.max(0, bar.value) / peak
              const failure = failed?.[index] ?? 0
              return (
                <button
                  key={bar.bucket}
                  ref={(node) => {
                    barRefs.current[bar.bucket] = node
                  }}
                  type="button"
                  tabIndex={bar.bucket === stop ? 0 : -1}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(bar.bucket)}
                  onFocus={() => {
                    setRoving(bar.bucket)
                    setReading(bar.bucket)
                  }}
                  onBlur={() => setReading((current) => (current === bar.bucket ? null : current))}
                  onPointerEnter={() => setReading(bar.bucket)}
                  onPointerLeave={() =>
                    setReading((current) => (current === bar.bucket ? null : current))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      if (!onDismiss || selected === null) return
                      event.stopPropagation()
                      onDismiss()
                      return
                    }
                    const step: Record<string, number> = {
                      ArrowLeft: bar.bucket - 1,
                      ArrowRight: bar.bucket + 1,
                      Home: 0,
                      End: bars.length - 1,
                    }
                    const next = step[event.key]
                    if (next === undefined) return
                    event.preventDefault()
                    const within = Math.min(bars.length - 1, Math.max(0, next))
                    setRoving(within)
                    barRefs.current[within]?.focus()
                  }}
                  className="group relative flex min-w-0 flex-1 cursor-pointer flex-col justify-end p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                >
                  <span className="sr-only">{bar.label}</span>
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      data-track="open"
                      className="pointer-events-none absolute -inset-y-1 rounded-[2px] border border-signal"
                      style={{
                        left: `calc(${COLUMN_INSET} - ${OPEN_MARGIN}px)`,
                        right: `calc(${COLUMN_INSET} - ${OPEN_MARGIN}px)`,
                      }}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="flex min-h-0 flex-1 flex-col items-center justify-end"
                  >
                    <span
                      data-track="bar"
                      className={cn(
                        'rounded-t-[1px]',
                        INK[tone],
                        tone === 'plain' &&
                          'group-hover:bg-data-ink-strong group-focus-visible:bg-data-ink-strong',
                        'track-grow',
                      )}
                      style={{
                        width: COLUMN_WIDTH,
                        height: share > 0 ? `${Math.round(share * 100)}%` : '1px',
                        animationDelay: `${index * STAGGER}ms`,
                      }}
                    />
                  </span>
                  <span
                    aria-hidden="true"
                    className="w-full shrink-0 bg-border"
                    style={{ height: 1, marginBlock: BASELINE_GAP }}
                  />
                  {failed && (
                    <span
                      aria-hidden="true"
                      data-track="failed-lane"
                      className="flex w-full flex-col items-center"
                      style={{ height: failureLane }}
                    >
                      {failure > 0 && (
                        <span
                          data-track="failed"
                          className="rounded-b-[1px] bg-state-bad"
                          style={{
                            width: COLUMN_WIDTH,
                            height: Math.max(
                              MIN_FAILURE,
                              Math.round((failure / failPeak) * failureLane),
                            ),
                          }}
                        />
                      )}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Hint>
      </div>

      {axis === 'labels' && (
        <div style={{ paddingRight: gutter }}>
          <MetricAxis anchor={anchor} count={bars.length} bucketMs={bucketMs} />
        </div>
      )}
    </div>
  )
}

/**
 * The times a window's buckets are dated by, on their own row. It stands apart
 * from the chart because a stack of charts read against one clock carries one
 * axis under the stack. The labels thin as the axis narrows: every other one
 * under 20rem, every fourth under 16rem, so times never overprint.
 */
export function MetricAxis({
  anchor,
  count,
  bucketMs = HOUR,
  className,
}: {
  anchor: string
  count: number
  bucketMs?: number
  className?: string
}) {
  const step = tickStep(count)
  return (
    <div
      aria-hidden="true"
      data-track="axis"
      className={cn(
        '@container relative h-4 font-mono text-nano tabular-nums text-dim-foreground',
        className,
      )}
    >
      {Array.from({ length: count }, (_, bucket) => bucket)
        .filter((bucket) => bucket % step === 0)
        .map((bucket, tick) => (
          <span
            key={bucket}
            className={cn(
              'absolute top-0 pt-1 pl-1 leading-none whitespace-nowrap',
              tick % 2 === 1 && '@max-xs:hidden',
              tick % 4 !== 0 && '@max-3xs:hidden',
            )}
            style={{ left: `${(bucket / count) * 100}%` }}
          >
            <span className="absolute top-0 left-0 h-[3px] w-px bg-border" />
            {bucketStart(anchor, bucket, count, bucketMs)?.toISOString().slice(11, 16)}
          </span>
        ))}
    </div>
  )
}

/** One column of a strip, already scaled by the surface drawing it. */
export interface StripColumn {
  key: string | number
  /** Share of the strip's height, 0–1, or null where nothing answered: a
   *  missing column is a dotted stub on the baseline, never a short column. */
  share: number | null
  tone: MetricTone
  /** What the column says to a reader who cannot see it. */
  label?: string
}

/** A moment worth marking along a strip: a hairline with a dot on top. */
export interface StripMarker {
  key: string
  /** 0 at the strip's left edge, 1 at its right. */
  offset: number
  /** Rose for what went wrong, the foreground for what somebody did. */
  tone: 'bad' | 'foreground'
}

const MARKER_INK: Record<StripMarker['tone'], string> = {
  bad: 'bg-state-bad',
  foreground: 'bg-foreground',
}

export interface MetricStripHandle {
  focus: () => void
}

export interface MetricStripProps {
  columns: readonly StripColumn[]
  label: string
  markers?: readonly StripMarker[]
  height?: number
  /** The column under the pointer or the keyboard, or null once it leaves. */
  onRead?: (index: number | null) => void
  selected?: number | null
  /** Given, every column is a button and the strip holds one tab stop. */
  onSelect?: (index: number) => void
  onDismiss?: () => void
  ref?: Ref<MetricStripHandle>
}

export function MetricStrip({
  columns,
  label,
  markers = [],
  height = ROW_HEIGHT,
  onRead,
  selected = null,
  onSelect,
  onDismiss,
  ref,
}: MetricStripProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [roving, setRoving] = useState<number | null>(null)
  const columnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const read = (index: number | null) => {
    setHovered(index)
    onRead?.(index)
  }
  const stop = roving ?? selected ?? columns.length - 1

  useImperativeHandle(ref, () => ({ focus: () => columnRefs.current[stop]?.focus() }), [stop])

  const drawn = (column: StripColumn, index: number) => (
    <>
      {column.share === null ? (
        <span
          className="h-px"
          style={{
            width: COLUMN_WIDTH,
            backgroundImage: dottedAcross('var(--dim-foreground)', 1, 1.5),
          }}
        />
      ) : (
        <span
          className={cn(
            'rounded-t-[1px]',
            column.tone === 'plain' && (hovered === index || selected === index)
              ? 'bg-data-ink-strong'
              : INK[column.tone],
          )}
          style={{
            width: COLUMN_WIDTH,
            height: column.share > 0 ? `${Math.min(1, column.share) * 100}%` : '1px',
          }}
        />
      )}
      {selected === index && (
        <span
          aria-hidden="true"
          data-track="open"
          className="pointer-events-none absolute inset-y-0 rounded-[2px] border border-signal"
          style={{
            left: `calc(${COLUMN_INSET} - ${OPEN_MARGIN}px)`,
            right: `calc(${COLUMN_INSET} - ${OPEN_MARGIN}px)`,
          }}
        />
      )}
    </>
  )

  const columnClass = 'relative flex h-full min-w-px flex-1 flex-col items-center justify-end pb-px'

  return (
    <div className="relative min-w-0" style={{ height }} onPointerLeave={() => read(null)}>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-shell-separator" />
      {onSelect ? (
        <div role="group" aria-label={label} className="relative flex h-full items-stretch pt-1">
          {columns.map((column, index) => (
            <button
              key={column.key}
              ref={(node) => {
                columnRefs.current[index] = node
              }}
              type="button"
              data-column={column.share === null ? 'gap' : 'result'}
              aria-label={column.label}
              aria-haspopup="dialog"
              aria-pressed={selected === index}
              tabIndex={index === stop ? 0 : -1}
              onClick={() => onSelect(index)}
              onFocus={() => {
                setRoving(index)
                read(index)
              }}
              onBlur={() => read(null)}
              onPointerEnter={() => read(index)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  if (!onDismiss || selected === null) return
                  event.stopPropagation()
                  onDismiss()
                  return
                }
                const step: Record<string, number> = {
                  ArrowLeft: index - 1,
                  ArrowRight: index + 1,
                  Home: 0,
                  End: columns.length - 1,
                }
                const next = step[event.key]
                if (next === undefined) return
                event.preventDefault()
                const within = Math.min(columns.length - 1, Math.max(0, next))
                setRoving(within)
                columnRefs.current[within]?.focus()
              }}
              className={cn(
                columnClass,
                'cursor-pointer p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
              )}
            >
              {drawn(column, index)}
            </button>
          ))}
        </div>
      ) : (
        <div role="img" aria-label={label} className="relative flex h-full items-stretch pt-1">
          {columns.map((column, index) => (
            <span
              key={column.key}
              data-column={column.share === null ? 'gap' : 'result'}
              onPointerEnter={() => read(index)}
              className={columnClass}
            >
              {drawn(column, index)}
            </span>
          ))}
        </div>
      )}
      {markers.map((marker) => (
        <span
          key={marker.key}
          aria-hidden="true"
          data-marker={marker.key}
          className={cn(
            'pointer-events-none absolute top-0.5 bottom-0 w-px',
            MARKER_INK[marker.tone],
          )}
          style={{ left: `${marker.offset * 100}%` }}
        >
          <span
            className={cn(
              'absolute -top-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full',
              MARKER_INK[marker.tone],
            )}
          />
        </span>
      ))}
    </div>
  )
}
