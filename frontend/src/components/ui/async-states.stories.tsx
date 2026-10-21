import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flag, Plus } from 'lucide-react'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { ErrorState } from './error-state'
import { Skeleton } from './skeleton'

const meta = {
  title: 'States/Empty, loading and error',
  component: EmptyState,
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

/** The three components, in the page size. */
export const Page: Story = {
  args: { title: 'No flags here yet' },
  render: () => (
    <div className="grid grid-cols-3 gap-6">
      <EmptyState
        icon={<Flag />}
        title="No flags here yet"
        body="A flag turns behaviour on per environment and rolls it out by percent."
        cta={
          <Button variant="soft" size="sm">
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            New flag
          </Button>
        }
      />
      <div aria-busy="true" className="flex flex-col gap-3 py-10">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-48" />
      </div>
      <ErrorState noun="flags" detail="The API did not answer in time." onRetry={() => {}} />
    </div>
  ),
}

/** The inspector and inline sizes. */
export const Smaller: Story = {
  args: Page.args,
  render: () => (
    <div className="flex max-w-md flex-col gap-6">
      <EmptyState variant="inspector" icon={<Flag />} title="Pick a flag" />
      <EmptyState variant="inline" title="Nothing has happened yet." />
      <ErrorState variant="inline" noun="evaluations" onRetry={() => {}} />
    </div>
  ),
}
