/**
 * A neutral pill group that changes *how* the same data is presented — a
 * filter, a status lens — as a radiogroup. Tabs change *what* you are looking
 * at; the two idioms never share a control.
 *
 * The pill is one element anchored to the checked option with CSS anchor
 * positioning, so choosing another slides it across (`.segmented-pill` in
 * index.css). Without anchor positioning the checked option fills itself.
 */
import { useId } from 'react'
import { anchorName } from '@/lib/popover'
import { cn } from '@/lib/utils'

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string; count?: number }[]
  onValueChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onValueChange,
  className,
}: SegmentedControlProps<T>) {
  const pill = anchorName(useId())
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'relative inline-flex h-8 items-center gap-0.5 rounded-md bg-well p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onValueChange(option.value)}
            style={active ? { anchorName: pill } : undefined}
            className={cn(
              'segmented-option relative z-[1] flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors duration-[var(--duration-fast)]',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{option.label}</span>
            {option.count !== undefined && <span className="count">{option.count}</span>}
          </button>
        )
      })}
      <span aria-hidden="true" className="segmented-pill" style={{ positionAnchor: pill }} />
    </div>
  )
}
