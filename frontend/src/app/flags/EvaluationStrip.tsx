/**
 * A flag's last hour as a strip whose minutes open. A press on a column, or
 * Enter on the one the keyboard is on, opens that minute's popover against
 * the column; Escape or a press outside puts it away and hands the keyboard
 * back to the column. A press on another column moves the popover there, and
 * a press on the open one closes it.
 *
 * The popover is native (`popover="manual"`, so the strip decides when it
 * closes) and anchored to an overlay on the open column with CSS anchor
 * positioning, so moving it is moving the overlay.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { ErrorState } from '@/components/ui/error-state'
import { MINUTE } from '@/components/ui/metric-time'
import { MetricAxis, MetricStrip, type MetricStripHandle } from '@/components/ui/metric-track'
import { Skeleton } from '@/components/ui/skeleton'
import {
  changeMarkers,
  minuteReading,
  stripColumns,
  windowSummary,
} from '@/features/flags/evaluations'
import { useFlagEvaluations } from '@/features/flags/use-flags'
import { anchoredStyle, anchorName, useShownPopover } from '@/lib/popover'
import type { Flag } from '@/types/api'
import { MinutePopover } from './MinutePopover'

const STRIP_HEIGHT = 56
const POPOVER_GAP = 6

export function EvaluationStrip({ flag }: { flag: Flag }) {
  const { data, isPending, error, refetch } = useFlagEvaluations(flag.key, flag.env)
  const [selected, setSelected] = useState<number | null>(null)
  // The minute the popover last held: it keeps it while it fades out.
  const [held, setHeld] = useState<number | null>(null)
  const [reading, setReading] = useState<number | null>(null)
  const handle = useRef<MetricStripHandle>(null)
  const box = useRef<HTMLDivElement>(null)
  const column = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const name = anchorName(useId())
  const open = selected !== null

  useShownPopover({
    popover: content,
    anchor: column,
    shown: open,
    side: 'bottom',
    align: 'center',
    gap: POPOVER_GAP,
    at: held,
  })

  // Focus lands on the popover as it opens, so a reader starts at its heading.
  useEffect(() => {
    if (open) content.current?.focus()
  }, [open])

  // Escape inside the popover puts it away and hands the keyboard back to the
  // strip. A press anywhere but the popover and the strip puts it away and
  // leaves the keyboard where that press put it; the strip's own columns move
  // or close the popover themselves.
  useEffect(() => {
    const node = content.current
    if (!open || !node) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setSelected(null)
      handle.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (node.contains(target) || box.current?.contains(target)) return
      setSelected(null)
    }
    node.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open])

  if (isPending) return <Skeleton className="h-[84px] w-full" />
  if (error) {
    return (
      <ErrorState
        variant="inline"
        noun="evaluations"
        detail={error.message}
        onRetry={() => void refetch()}
      />
    )
  }

  const columns = stripColumns(data)
  const count = columns.length
  const minute = selected !== null ? minuteReading(data, selected, flag.updated_at) : null
  const shownMinute = held !== null ? minuteReading(data, held, flag.updated_at) : null
  const last = data.points[count - 1]
  const anchor = last ? new Date(new Date(last.t).getTime() + MINUTE).toISOString() : ''
  const readout =
    reading !== null
      ? columns[reading]?.label
      : minute
        ? `Open · ${columns[selected ?? 0]?.label}`
        : windowSummary(data)

  return (
    <div className="flex flex-col gap-1.5">
      <output
        aria-live="polite"
        className="min-h-4 text-right font-mono text-xs tabular-nums text-muted-foreground"
      >
        {readout}
      </output>
      <div ref={box} className="relative min-w-0">
        <MetricStrip
          ref={handle}
          height={STRIP_HEIGHT}
          label={`Evaluations of ${flag.key} in ${flag.env}, last ${count} minutes`}
          columns={columns}
          markers={changeMarkers(data, flag.updated_at)}
          onRead={setReading}
          selected={minute ? selected : null}
          onSelect={(index) => {
            setHeld(index)
            setSelected((current) => (current === index ? null : index))
          }}
          onDismiss={() => setSelected(null)}
        />
        {held !== null && (
          <span
            ref={column}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0"
            style={{
              left: `${(held / count) * 100}%`,
              width: `${100 / count}%`,
              anchorName: name,
            }}
          />
        )}
      </div>
      <div
        ref={content}
        popover="manual"
        role="dialog"
        tabIndex={-1}
        aria-label={shownMinute ? `${flag.key} at ${shownMinute.at.slice(11, 16)} UTC` : undefined}
        style={anchoredStyle(name, 'bottom', 'center', POPOVER_GAP)}
        className="anchored popover-motion w-[300px] rounded-lg border border-border bg-popover p-4 text-left shadow-overlay outline-none"
      >
        {shownMinute && <MinutePopover minute={shownMinute} flag={flag} />}
      </div>
      {anchor && <MetricAxis anchor={anchor} count={count} bucketMs={MINUTE} />}
    </div>
  )
}
