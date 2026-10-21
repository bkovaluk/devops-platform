import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { MINUTE } from './metric-time'
import { type MetricBar, MetricStrip, MetricTrack, type StripColumn } from './metric-track'

const ANCHOR = '2026-10-20T18:00:00.000Z'

const counts = Array.from({ length: 24 }, (_, hour) =>
  Math.round(180 + 120 * Math.sin(hour / 3) + (hour % 5) * 17),
)

const bars: MetricBar[] = counts.map((value, bucket) => ({
  bucket,
  value,
  label: `${value} evaluations`,
  readings: [`${value.toLocaleString()} evaluations`],
}))

const meta = {
  title: 'Data/MetricTrack',
  component: MetricTrack,
} satisfies Meta<typeof MetricTrack>

export default meta
type Story = StoryObj<typeof meta>

/** A day of quiet columns, failures hanging in their own lane. */
export const Day: Story = {
  args: {
    bars,
    anchor: ANCHOR,
    label: 'Evaluations, last 24 hours',
    selected: null,
    onSelect: () => {},
    failures: counts.map((_, hour) => (hour === 9 ? 14 : hour === 15 ? 3 : 0)),
    idleReading: `${counts.reduce((a, b) => a + b, 0).toLocaleString()} evaluations`,
  },
  render: function Render(args) {
    const [selected, setSelected] = useState<number | null>(null)
    return (
      <MetricTrack
        {...args}
        selected={selected}
        onSelect={(bucket) => setSelected((open) => (open === bucket ? null : bucket))}
        onDismiss={() => setSelected(null)}
      />
    )
  },
}

const minutes: StripColumn[] = Array.from({ length: 60 }, (_, minute) => ({
  key: minute,
  share: minute % 17 === 0 ? null : 0.35 + 0.6 * Math.abs(Math.sin(minute / 7)),
  tone: minute === 41 ? 'warn' : 'plain',
  label: `minute ${minute}`,
}))

/** The same columns at row height, a minute each, with a marked change. */
export const Strip: Story = {
  args: Day.args,
  render: () => (
    <div className="flex flex-col gap-1.5">
      <MetricStrip
        label="Evaluations, last hour"
        columns={minutes}
        height={56}
        markers={[{ key: 'changed', offset: 0.7, tone: 'foreground' }]}
      />
      <span className="font-mono text-nano text-dim-foreground">
        {MINUTE / 1000}s columns, newest on the right
      </span>
    </div>
  ),
}
